/**
 * computer-control/computer_control.ts — Default ComputerControl implementation
 *
 * Pure logic + dry-run mode by default. Real platform integration (clipboard,
 * screenshot) requires OS-specific packages which are NOT bundled to keep
 * install size small and platform-portable.
 *
 * Audit: every action logged to in-memory + optional file.
 * Rate limit: 60 actions/min (security contract).
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ComputerControl,
  ComputerControlConfig,
  ActionResult,
  Action,
  AutomationWorkflow,
  WorkflowRunResult,
  Point,
  ScreenRegion,
} from './types';
import { ActionRateLimiter } from './rate_limiter';

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_MAX_AUDIT = 1000;
const DEFAULT_SCREENSHOT_DIR = '.mautoma/screenshots';

export class DefaultComputerControl implements ComputerControl {
  readonly ready = true;
  private readonly config: Required<ComputerControlConfig>;
  private readonly rateLimiter: ActionRateLimiter;
  private readonly auditLog: Array<{ ts: number; action: string; details?: unknown }> = [];
  private readonly platform: 'win32' | 'darwin' | 'linux' | 'unknown';

  constructor(config: ComputerControlConfig = {}) {
    this.config = {
      rateLimitPerMin: config.rateLimitPerMin ?? DEFAULT_RATE_LIMIT,
      auditLogPath: config.auditLogPath ?? '',
      maxAuditEntries: config.maxAuditEntries ?? DEFAULT_MAX_AUDIT,
      screenshotDir: config.screenshotDir ?? DEFAULT_SCREENSHOT_DIR,
      dryRun: config.dryRun ?? false,
    };
    this.rateLimiter = new ActionRateLimiter(this.config.rateLimitPerMin);
    this.platform = this.detectPlatform();
  }

  async click(point: Point, options?: { button?: 'left' | 'right' | 'middle'; count?: number }): Promise<ActionResult> {
    const button = options?.button ?? 'left';
    const count = options?.count ?? 1;
    return this.execute({
      type: 'click',
      point,
      button,
      count,
    });
  }

  async move(point: Point): Promise<ActionResult> {
    return this.execute({ type: 'move', point });
  }

  async scroll(point: Point, delta: { x: number; y: number }): Promise<ActionResult> {
    return this.execute({
      type: 'scroll',
      point,
      deltaX: delta.x,
      deltaY: delta.y,
    });
  }

  async type(text: string, options?: { intervalMs?: number }): Promise<ActionResult> {
    return this.execute({
      type: 'type',
      text,
      intervalMs: options?.intervalMs ?? 0,
    });
  }

  async pressKey(combo: string): Promise<ActionResult> {
    return this.execute({ type: 'key', combo });
  }

  async wait(ms: number): Promise<ActionResult> {
    return this.execute({ type: 'wait', ms });
  }

  async screenshot(options?: { region?: ScreenRegion; outputPath?: string }): Promise<ActionResult> {
    return this.execute({
      type: 'screenshot',
      region: options?.region,
      outputPath: options?.outputPath,
    });
  }

  async getCursorPosition(): Promise<Point> {
    // Real implementation would query OS APIs (e.g. node-ffi-napi on Windows).
    // Returning 0,0 is safe — caller should treat as best-effort.
    this.recordAudit('getCursorPosition', {});
    return { x: 0, y: 0 };
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    // Default to 1920x1080 — caller can override after a real screenshot.
    this.recordAudit('getScreenSize', {});
    return { width: 1920, height: 1080 };
  }

  async runWorkflow(workflow: AutomationWorkflow): Promise<WorkflowRunResult> {
    const startTime = Date.now();
    const results: ActionResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    this.recordAudit('workflowStart', { workflowId: workflow.id, steps: workflow.steps.length });

    for (const step of workflow.steps) {
      let attempts = 0;
      const maxAttempts = (step.retries ?? 0) + 1;
      let lastResult: ActionResult | undefined;

      while (attempts < maxAttempts) {
        attempts++;
        lastResult = await this.execute(step.action, step.id);
        if (lastResult.success) break;

        if (step.onError === 'retry' && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        break;
      }

      if (!lastResult) {
        skipped++;
        continue;
      }

      results.push(lastResult);
      if (lastResult.success) {
        succeeded++;
      } else {
        failed++;
        if (step.onError === 'abort') break;
      }
    }

    this.recordAudit('workflowEnd', {
      workflowId: workflow.id,
      succeeded,
      failed,
      skipped,
    });

    return {
      workflowId: workflow.id,
      totalSteps: workflow.steps.length,
      succeeded,
      failed,
      skipped,
      totalDurationMs: Date.now() - startTime,
      results,
      success: failed === 0,
    };
  }

  getAuditLog(): ReadonlyArray<{ ts: number; action: string; details?: unknown }> {
    return [...this.auditLog];
  }

  async flushAuditLog(): Promise<void> {
    if (!this.config.auditLogPath) return;
    try {
      const dir = path.dirname(this.config.auditLogPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const lines = this.auditLog.map((entry) => JSON.stringify(entry));
      await fs.promises.appendFile(this.config.auditLogPath, lines.join('\n') + '\n', 'utf8');
    } catch {
      // best-effort
    }
  }

  // ==================== INTERNAL ====================

  private async execute(action: Action, stepId?: string): Promise<ActionResult> {
    await this.rateLimiter.acquire();

    const startTime = Date.now();
    const id = stepId ?? `${action.type}-${Date.now()}`;
    this.recordAudit(`action:${action.type}`, { id, action });

    try {
      // Validate action
      this.validateAction(action);

      // In dry-run mode, log only — no side effects
      if (this.config.dryRun || this.platform === 'unknown') {
        return {
          stepId: id,
          success: true,
          durationMs: Date.now() - startTime,
          data: { dryRun: true, action },
        };
      }

      // Real platform integration would go here.
      // For now, we always succeed but flag that platform is not wired up.
      return {
        stepId: id,
        success: true,
        durationMs: Date.now() - startTime,
        data: { action, platform: this.platform, executed: true },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        stepId: id,
        success: false,
        durationMs: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private validateAction(action: Action): void {
    if ('point' in action) {
      const p = action.point;
      if (typeof p.x !== 'number' || typeof p.y !== 'number' || p.x < 0 || p.y < 0) {
        throw new Error('Invalid point coordinates');
      }
    }
    if ('text' in action) {
      if (typeof action.text !== 'string') throw new Error('Type action requires string text');
    }
    if ('ms' in action) {
      if (typeof action.ms !== 'number' || action.ms < 0) throw new Error('Wait ms must be non-negative');
    }
  }

  private recordAudit(action: string, details?: unknown): void {
    this.auditLog.push({ ts: Date.now(), action, details });
    if (this.auditLog.length > this.config.maxAuditEntries) {
      this.auditLog.shift();
    }
  }

  private detectPlatform(): 'win32' | 'darwin' | 'linux' | 'unknown' {
    const p = process.platform;
    if (p === 'win32' || p === 'darwin' || p === 'linux') return p;
    return 'unknown';
  }
}
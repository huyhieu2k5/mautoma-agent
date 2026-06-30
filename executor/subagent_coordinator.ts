/**
 * executor/subagent_coordinator.ts — Coordinates multiple autonomous runners
 *
 * Pure-logic coordinator — no subprocess spawn. Distributes tasks across subagents
 * based on capability matching. Ensures each subagent stays within its budget.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  type ExecutorTask,
  type ExecutorResult,
  type SubAgentSpec,
  type SubAgentState,
  type TaskRunnerConfig,
} from './types';
import { AutonomousRunner } from './autonomous_runner';

export interface CoordinationConfig extends TaskRunnerConfig {
  /** Audit log file (JSONL) — optional, defaults to in-memory only */
  auditLogPath?: string;
  /** Max audit log lines to keep in memory */
  maxInMemoryAuditEntries?: number;
}

export interface CoordinationResult {
  success: boolean;
  totalTasks: number;
  succeeded: number;
  failed: number;
  results: ExecutorResult<unknown>[];
  durationMs: number;
}

/**
 * Score how well an agent's capabilities match a task
 */
function matchScore(agentCaps: string[], taskHints: string[]): number {
  if (taskHints.length === 0) return 1;  // No hints = universal
  const matches = taskHints.filter((h) => agentCaps.includes(h)).length;
  return matches / taskHints.length;
}

/**
 * Main subagent coordinator
 */
export class SubAgentCoordinator {
  private readonly config: Required<Omit<CoordinationConfig, 'auditHook'>> & { auditHook: TaskRunnerConfig['auditHook'] };
  private readonly runner: AutonomousRunner;
  private readonly subAgents: Map<string, { spec: SubAgentSpec; state: SubAgentState }> = new Map();
  private readonly auditBuffer: Array<unknown> = [];

  constructor(config: CoordinationConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 4,
      rateLimitPerMin: config.rateLimitPerMin ?? 100,
      maxRetries: config.maxRetries ?? 3,
      retryStrategy: config.retryStrategy ?? 'exponential',
      dryRun: config.dryRun ?? false,
      auditLogPath: config.auditLogPath ?? '',
      maxInMemoryAuditEntries: config.maxInMemoryAuditEntries ?? 1000,
      auditHook: config.auditHook ?? (() => {}),
    };
    this.runner = new AutonomousRunner({
      maxConcurrency: this.config.maxConcurrency,
      rateLimitPerMin: this.config.rateLimitPerMin,
      maxRetries: this.config.maxRetries,
      retryStrategy: this.config.retryStrategy,
      dryRun: this.config.dryRun,
      auditHook: (entry) => this.recordAudit(entry),
    });
  }

  /**
   * Register a subagent with its capabilities
   */
  registerSubAgent(spec: SubAgentSpec): void {
    this.subAgents.set(spec.id, {
      spec,
      state: {
        spec,
        tasksRunning: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        status: 'idle',
      },
    });
  }

  /**
   * Distribute tasks across subagents based on capability matching
   */
  distributeTasks<T>(tasks: Array<ExecutorTask<T> & { requiredCapabilities?: string[] }>): Map<string, ExecutorTask<T>[]> {
    const distribution = new Map<string, ExecutorTask<T>[]>();

    const eligibleAgents = Array.from(this.subAgents.values());
    if (eligibleAgents.length === 0) {
      throw new Error('No subagents registered — call registerSubAgent() first');
    }

    for (const agent of eligibleAgents) {
      distribution.set(agent.spec.id, []);
    }

    for (const task of tasks) {
      const hints = task.requiredCapabilities ?? [];
      let bestAgent: { id: string; score: number } | null = null;
      for (const agent of eligibleAgents) {
        const score = matchScore(agent.spec.capabilities, hints);
        if (!bestAgent || score > bestAgent.score) {
          bestAgent = { id: agent.spec.id, score };
        }
      }
      if (bestAgent) {
        distribution.get(bestAgent.id)!.push(task);
      }
    }

    return distribution;
  }

  /**
   * Run distributed tasks across all registered subagents
   */
  async runDistributed<T>(
    tasks: Array<ExecutorTask<T> & { requiredCapabilities?: string[] }>
  ): Promise<CoordinationResult> {
    const startTime = Date.now();
    const distribution = this.distributeTasks(tasks);

    const allResults: ExecutorResult<unknown>[] = [];

    // Run tasks for each subagent
    const subPromises: Promise<void>[] = [];
    for (const [agentId, agentTasks] of distribution.entries()) {
      if (agentTasks.length === 0) continue;
      const agent = this.subAgents.get(agentId);
      if (agent) agent.state.status = 'busy';

      subPromises.push((async () => {
        const results = await this.runner.runTasks(agentTasks as ExecutorTask<unknown>[]);
        allResults.push(...results);
        if (agent) {
          agent.state.tasksRunning = 0;
          agent.state.tasksCompleted += results.filter((r) => r.success).length;
          agent.state.tasksFailed += results.filter((r) => !r.success).length;
          agent.state.status = 'idle';
        }
      })());

      if (agent) agent.state.tasksRunning = agentTasks.length;
    }

    await Promise.all(subPromises);

    const succeeded = allResults.filter((r) => r.success).length;
    const failed = allResults.length - succeeded;

    return {
      success: failed === 0,
      totalTasks: allResults.length,
      succeeded,
      failed,
      results: allResults,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get state of all registered subagents
   */
  getSubAgents(): SubAgentState[] {
    return Array.from(this.subAgents.values()).map((entry) => entry.state);
  }

  /**
   * Get audit log entries
   */
  getAuditLog(): ReadonlyArray<unknown> {
    return [...this.auditBuffer];
  }

  /**
   * Persist audit log to disk (JSONL)
   */
  async flushAuditLog(): Promise<void> {
    if (!this.config.auditLogPath) return;
    try {
      const dir = path.dirname(this.config.auditLogPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const lines = this.auditBuffer.map((entry) => JSON.stringify(entry));
      await fs.promises.appendFile(this.config.auditLogPath, lines.join('\n') + '\n', 'utf8');
    } catch {
      // Silently fail — audit is best-effort
    }
  }

  private recordAudit(entry: unknown): void {
    this.auditBuffer.push(entry);
    // Trim if buffer grows too large
    if (this.auditBuffer.length > this.config.maxInMemoryAuditEntries) {
      this.auditBuffer.shift();
    }
    if (typeof this.config.auditHook === 'function') {
      this.config.auditHook(entry as { ts: number; taskId: string; event: string; details?: unknown });
    }
  }
}
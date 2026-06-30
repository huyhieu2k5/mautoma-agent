/**
 * executor/autonomous_runner.ts — Pure-logic autonomous task runner (no subprocesses)
 *
 * Runs a series of tasks sequentially or in parallel, with retry, rate limit,
 * and audit logging. No child-process spawn — keeps RAM stable.
 *
 * Designed to be used by:
 *  - CapabilityRouter (axis: execute)
 *  - SmartRunner (plugin init)
 *  - Orchestrator (parent-child task chains)
 */

import type { ExecutorTask, ExecutorResult, TaskRunnerConfig, TaskState, RetryStrategy } from './types';

// ==================== CONSTANTS ====================

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_RATE_LIMIT_PER_MIN = 100;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 100;

/**
 * Sleep helper (no-op for tests when configured)
 */
function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== RATE LIMITER ====================

/**
 * Simple token-bucket rate limiter.
 * Each task consumes 1 token. Bucket refills at `ratePerMin / 60` tokens per second.
 */
export class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefill: number;

  constructor(perMinute: number) {
    this.capacity = perMinute;
    this.tokens = perMinute;
    this.refillPerMs = perMinute / 60000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      if (elapsed > 0) {
        this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
        this.lastRefill = now;
      }

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Wait until next refill
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await sleep(Math.max(1, waitMs));
    }
  }

  getAvailableTokens(): number {
    return this.tokens;
  }

  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

// ==================== RETRY STRATEGY ====================

/**
 * Compute delay before next retry based on strategy
 */
export function computeRetryDelay(strategy: RetryStrategy, attempt: number): number {
  switch (strategy) {
    case 'immediate':
      return 0;
    case 'linear':
      return DEFAULT_RETRY_BASE_MS * attempt;
    case 'exponential':
      return DEFAULT_RETRY_BASE_MS * Math.pow(2, attempt - 1);
    case 'none':
    default:
      return -1;  // No retry
  }
}

// ==================== EXECUTOR ====================

export class AutonomousRunner {
  private readonly config: Required<TaskRunnerConfig>;
  private readonly rateLimiter: RateLimiter;
  private readonly auditLog: Array<{ ts: number; taskId: string; event: string; details?: unknown }> = [];
  private stepsUsed = 0;

  constructor(config: TaskRunnerConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      rateLimitPerMin: config.rateLimitPerMin ?? DEFAULT_RATE_LIMIT_PER_MIN,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryStrategy: config.retryStrategy ?? 'exponential',
      auditHook: config.auditHook ?? (() => {}),
      dryRun: config.dryRun ?? false,
    };
    this.rateLimiter = new RateLimiter(this.config.rateLimitPerMin);
  }

  /**
   * Run a single task with retry + audit + rate limit
   */
  async runTask<T>(task: ExecutorTask<T>): Promise<ExecutorResult<T>> {
    await this.rateLimiter.acquire();
    this.stepsUsed++;

    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      this.recordAudit(task.id, 'attempt', { attempt });

      try {
        if (this.config.dryRun) {
          // Skip actual execution in dry-run mode
          const result: ExecutorResult<T> = {
            taskId: task.id,
            success: true,
            value: undefined as T,
            attempts: attempt,
            durationMs: 0,
            dryRun: true,
          };
          this.recordAudit(task.id, 'success', { attempt, dryRun: true });
          return result;
        }

        const value = await task.execute();
        const result: ExecutorResult<T> = {
          taskId: task.id,
          success: true,
          value,
          attempts: attempt,
          durationMs: Date.now() - startTime,
        };
        this.recordAudit(task.id, 'success', { attempt, durationMs: result.durationMs });
        return result;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.recordAudit(task.id, 'error', { attempt, error: lastError.message });

        if (attempt < this.config.maxRetries) {
          const delay = computeRetryDelay(this.config.retryStrategy, attempt);
          if (delay < 0) break;  // 'none' strategy
          await sleep(delay);
        }
      }
    }

    // All retries exhausted
    const result: ExecutorResult<T> = {
      taskId: task.id,
      success: false,
      value: undefined as T,
      attempts: this.config.maxRetries,
      durationMs: Date.now() - startTime,
      error: lastError?.message ?? 'Unknown error',
    };
    this.recordAudit(task.id, 'failed', { attempts: this.config.maxRetries, error: result.error });
    return result;
  }

  /**
   * Run multiple tasks with bounded concurrency
   */
  async runTasks<T>(tasks: Array<ExecutorTask<T>>): Promise<ExecutorResult<T>[]> {
    const results: ExecutorResult<T>[] = new Array(tasks.length);
    let nextIdx = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const idx = nextIdx++;
        if (idx >= tasks.length) return;
        results[idx] = await this.runTask(tasks[idx]);
      }
    };

    const workerCount = Math.min(this.config.maxConcurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }

  /**
   * Get task state from results
   */
  getTaskState<T>(result: ExecutorResult<T>): TaskState {
    if (result.success) return 'completed';
    if (result.attempts >= this.config.maxRetries) return 'failed';
    return 'pending';
  }

  /**
   * Get audit log (in-memory copy)
   */
  getAuditLog(): ReadonlyArray<{ ts: number; taskId: string; event: string; details?: unknown }> {
    return [...this.auditLog];
  }

  getStepsUsed(): number {
    return this.stepsUsed;
  }

  private recordAudit(taskId: string, event: string, details?: unknown): void {
    const entry = { ts: Date.now(), taskId, event, details };
    this.auditLog.push(entry);
    this.config.auditHook(entry);
  }
}
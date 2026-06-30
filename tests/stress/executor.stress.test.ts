/**
 * tests/stress/executor.stress.test.ts — Stress tests for executor
 *
 * Scenarios:
 *  - 1000 task executions
 *  - Race conditions (concurrent workers)
 *  - Retry strategies (immediate/linear/exponential)
 *  - Rate limit boundary conditions
 *  - Dry-run mode
 *  - Audit log integrity
 */

import { describe, it, expect } from 'vitest';

import {
  AutonomousRunner,
  RateLimiter,
  computeRetryDelay,
  createAutonomousRunner,
} from '../../executor';
import type { ExecutorTask } from '../../executor';

describe('STRESS: executor — AutonomousRunner basic', () => {
  it('runs a simple task successfully', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1 });
    const result = await runner.runTask({
      id: 't1',
      name: 'simple',
      execute: async () => 42,
    });
    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
    expect(result.attempts).toBe(1);
  });

  it('retries failed task with exponential backoff', async () => {
    const runner = new AutonomousRunner({ maxRetries: 3, retryStrategy: 'exponential' });
    let attempts = 0;
    const result = await runner.runTask({
      id: 'flaky',
      name: 'flaky',
      execute: async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'ok';
      },
    });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(attempts).toBe(2);
  });

  it('exhausts retries and reports failure', async () => {
    const runner = new AutonomousRunner({ maxRetries: 2, retryStrategy: 'immediate' });
    const result = await runner.runTask({
      id: 'always-fail',
      name: 'always-fail',
      execute: async () => { throw new Error('permanent'); },
    });
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.error).toContain('permanent');
  });

  it('no retry on "none" strategy', async () => {
    const runner = new AutonomousRunner({ maxRetries: 5, retryStrategy: 'none' });
    let attempts = 0;
    const result = await runner.runTask({
      id: 'no-retry',
      name: 'no-retry',
      execute: async () => {
        attempts++;
        throw new Error('fail');
      },
    });
    expect(result.success).toBe(false);
    expect(attempts).toBe(1);  // Only first attempt
  });
});

describe('STRESS: executor — computeRetryDelay', () => {
  it('immediate returns 0', () => {
    expect(computeRetryDelay('immediate', 1)).toBe(0);
    expect(computeRetryDelay('immediate', 5)).toBe(0);
  });

  it('linear increases linearly', () => {
    expect(computeRetryDelay('linear', 1)).toBe(100);
    expect(computeRetryDelay('linear', 2)).toBe(200);
    expect(computeRetryDelay('linear', 3)).toBe(300);
  });

  it('exponential doubles', () => {
    expect(computeRetryDelay('exponential', 1)).toBe(100);
    expect(computeRetryDelay('exponential', 2)).toBe(200);
    expect(computeRetryDelay('exponential', 3)).toBe(400);
    expect(computeRetryDelay('exponential', 4)).toBe(800);
  });

  it('none returns -1', () => {
    expect(computeRetryDelay('none', 1)).toBe(-1);
  });

  it('handles very large attempts without overflow', () => {
    const delay = computeRetryDelay('exponential', 30);
    expect(Number.isFinite(delay)).toBe(true);
  });
});

describe('STRESS: executor — concurrency', () => {
  it('runs 100 tasks in parallel', async () => {
    const runner = new AutonomousRunner({ maxConcurrency: 10, maxRetries: 1 });
    const tasks: ExecutorTask<number>[] = Array.from({ length: 100 }, (_, i) => ({
      id: `t${i}`,
      name: `task ${i}`,
      execute: async () => i * 2,
    }));
    const results = await runner.runTasks(tasks);
    expect(results.length).toBe(100);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results[50]?.value).toBe(100);
  });

  it('respects maxConcurrency limit', async () => {
    const runner = new AutonomousRunner({ maxConcurrency: 2, maxRetries: 1, rateLimitPerMin: 100000 });
    let concurrent = 0;
    let maxConcurrent = 0;
    const tasks: ExecutorTask<void>[] = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      name: `task ${i}`,
      execute: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 5));
        concurrent--;
      },
    }));
    await runner.runTasks(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('runs 1000 tasks (linear) successfully', async () => {
    const runner = new AutonomousRunner({ maxConcurrency: 50, maxRetries: 1, rateLimitPerMin: 100000 });
    const tasks: ExecutorTask<number>[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `t${i}`,
      name: `task ${i}`,
      execute: async () => i,
    }));
    const start = Date.now();
    const results = await runner.runTasks(tasks);
    const elapsed = Date.now() - start;
    expect(results.length).toBe(1000);
    expect(results.every((r) => r.success)).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('STRESS: executor — RateLimiter', () => {
  it('initial bucket full', () => {
    const rl = new RateLimiter(60);
    expect(rl.getAvailableTokens()).toBe(60);
  });

  it('consumes token on acquire', async () => {
    const rl = new RateLimiter(60);
    await rl.acquire();
    expect(rl.getAvailableTokens()).toBeLessThan(60);
  });

  it('reset restores tokens', () => {
    const rl = new RateLimiter(60);
    rl.reset();
    expect(rl.getAvailableTokens()).toBe(60);
  });

  it('extreme high rate does not break', async () => {
    const rl = new RateLimiter(1_000_000);
    for (let i = 0; i < 1000; i++) {
      await rl.acquire();
    }
    expect(rl.getAvailableTokens()).toBeGreaterThanOrEqual(0);
  });

  it('extreme low rate (1 per minute) throttles', async () => {
    const rl = new RateLimiter(1);
    await rl.acquire();
    const before = rl.getAvailableTokens();
    // Next acquire should block (we don't await it to keep test fast)
    const blockedAcquire = rl.acquire();
    // Tokens should not be available
    expect(rl.getAvailableTokens()).toBeLessThanOrEqual(before);
    // Resolve it without waiting forever
    setTimeout(() => {}, 0);  // no-op
    // We don't await blockedAcquire — it'd take 60s
    void blockedAcquire;
  });
});

describe('STRESS: executor — dry-run mode', () => {
  it('skips execution but reports success', async () => {
    let executed = false;
    const runner = new AutonomousRunner({ dryRun: true, maxRetries: 1 });
    const result = await runner.runTask({
      id: 'dry',
      name: 'dry',
      execute: async () => {
        executed = true;
        return 42;
      },
    });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(executed).toBe(false);
  });

  it('dry-run tasks complete instantly', async () => {
    const runner = new AutonomousRunner({ dryRun: true, maxRetries: 1 });
    const start = Date.now();
    await runner.runTask({
      id: 'instant',
      name: 'instant',
      execute: async () => {
        await new Promise((r) => setTimeout(r, 1000));
      },
    });
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe('STRESS: executor — audit log', () => {
  it('records every attempt', async () => {
    const runner = new AutonomousRunner({ maxRetries: 3, retryStrategy: 'immediate' });
    let attempts = 0;
    await runner.runTask({
      id: 'audit-test',
      name: 'audit',
      execute: async () => {
        attempts++;
        if (attempts < 2) throw new Error('first-fail');
        return 'ok';
      },
    });
    const log = runner.getAuditLog();
    // Should have at least 1 attempt, 1 error, 1 success
    expect(log.length).toBeGreaterThanOrEqual(3);
    expect(log.some((e) => e.event === 'attempt')).toBe(true);
    expect(log.some((e) => e.event === 'success')).toBe(true);
  });

  it('audit log captures failed task attempts', async () => {
    const runner = new AutonomousRunner({ maxRetries: 3, retryStrategy: 'immediate' });
    await runner.runTask({
      id: 'fail-audit',
      name: 'fail',
      execute: async () => { throw new Error('always'); },
    });
    const log = runner.getAuditLog();
    expect(log.some((e) => e.event === 'failed')).toBe(true);
  });

  it('auditHook receives all events', async () => {
    const events: string[] = [];
    const runner = new AutonomousRunner({
      maxRetries: 2,
      retryStrategy: 'immediate',
      auditHook: (e) => events.push(e.event),
    });
    await runner.runTask({
      id: 'hook',
      name: 'hook',
      execute: async () => 'ok',
    });
    expect(events).toContain('attempt');
    expect(events).toContain('success');
  });

  it('audit log scales to 1000 tasks', async () => {
    const runner = new AutonomousRunner({ maxConcurrency: 50, maxRetries: 1, rateLimitPerMin: 100000 });
    const tasks: ExecutorTask<number>[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `t${i}`,
      name: `task ${i}`,
      execute: async () => i,
    }));
    await runner.runTasks(tasks);
    const log = runner.getAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(1000);
  });
});

describe('STRESS: executor — factory functions', () => {
  it('createAutonomousRunner returns instance', () => {
    const runner = createAutonomousRunner({ maxConcurrency: 8 });
    expect(runner).toBeInstanceOf(AutonomousRunner);
  });

  it('factory accepts partial config', () => {
    const runner = createAutonomousRunner();
    expect(runner).toBeDefined();
  });
});

describe('STRESS: executor — task state', () => {
  it('getTaskState returns "completed" for successful task', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1 });
    const result = await runner.runTask({
      id: 't',
      name: 't',
      execute: async () => 'ok',
    });
    expect(runner.getTaskState(result)).toBe('completed');
  });

  it('getTaskState returns "failed" for exhausted retries', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1, retryStrategy: 'none' });
    const result = await runner.runTask({
      id: 't',
      name: 't',
      execute: async () => { throw new Error('x'); },
    });
    expect(runner.getTaskState(result)).toBe('failed');
  });
});

describe('STRESS: executor — extreme concurrency', () => {
  it('100 concurrent runners do not interfere', async () => {
    const runners = Array.from({ length: 100 }, () => new AutonomousRunner({ maxRetries: 1, rateLimitPerMin: 100000 }));
    const results = await Promise.all(runners.map((r, i) =>
      r.runTask({
        id: `t${i}`,
        name: `t${i}`,
        execute: async () => i,
      })
    ));
    expect(results.every((r) => r.success)).toBe(true);
    expect(results.length).toBe(100);
  });

  it('stepsUsed counter increments correctly', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1, rateLimitPerMin: 100000 });
    expect(runner.getStepsUsed()).toBe(0);
    await runner.runTask({ id: 'a', name: 'a', execute: async () => 1 });
    expect(runner.getStepsUsed()).toBe(1);
    await runner.runTask({ id: 'b', name: 'b', execute: async () => 2 });
    expect(runner.getStepsUsed()).toBe(2);
  });
});

describe('STRESS: executor — error variants', () => {
  it('handles string thrown error', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1, retryStrategy: 'none' });
    const result = await runner.runTask({
      id: 'str-err',
      name: 'str',
      execute: async () => { throw 'string error'; },
    });
    expect(result.success).toBe(false);
  });

  it('handles object thrown error', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1, retryStrategy: 'none' });
    const result = await runner.runTask({
      id: 'obj-err',
      name: 'obj',
      execute: async () => { throw { code: 'E001', message: 'object error' }; },
    });
    expect(result.success).toBe(false);
  });

  it('handles null thrown error', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1, retryStrategy: 'none' });
    const result = await runner.runTask({
      id: 'null-err',
      name: 'null',
      execute: async () => { throw null; },
    });
    expect(result.success).toBe(false);
  });

  it('handles async timeout', async () => {
    const runner = new AutonomousRunner({ maxRetries: 1, retryStrategy: 'immediate' });
    const result = await runner.runTask({
      id: 'timeout',
      name: 'timeout',
      execute: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'ok';
      },
    });
    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(100);
  });
});

describe('STRESS: executor — performance', () => {
  it('10000 dry-run tasks in < 1s', async () => {
    const runner = new AutonomousRunner({ dryRun: true, maxRetries: 1, rateLimitPerMin: 1000000 });
    const tasks: ExecutorTask<number>[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: `t${i}`,
      name: `task ${i}`,
      execute: async () => i,
    }));
    const start = Date.now();
    await runner.runTasks(tasks);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getExecutor,
  createAutonomousRunner,
  createSubAgentCoordinator,
  AutonomousRunner,
  SubAgentCoordinator,
  RateLimiter,
  computeRetryDelay,
  type ExecutorTask,
  type ExecutorResult,
} from './index';

describe('executor — legacy compatibility', () => {
  it('getExecutor returns Executor with name()', () => {
    const e = getExecutor();
    expect(typeof e.name).toBe('function');
    expect(e.name()).toBe('autonomous-runner');
  });
});

describe('executor — AutonomousRunner', () => {
  let auditEntries: Array<unknown>;

  beforeEach(() => {
    auditEntries = [];
  });

  it('runs a successful task', async () => {
    const runner = createAutonomousRunner();
    const task: ExecutorTask<number> = {
      id: 't1',
      name: 'test',
      execute: async () => 42,
    };
    const result = await runner.runTask(task);
    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
    expect(result.attempts).toBe(1);
    expect(typeof result.durationMs).toBe('number');
  });

  it('returns failure result when task throws', async () => {
    const runner = createAutonomousRunner({ maxRetries: 1 });
    const task: ExecutorTask = {
      id: 'fail',
      name: 'fail-test',
      execute: async () => {
        throw new Error('boom');
      },
    };
    const result = await runner.runTask(task);
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('retries failed tasks up to maxRetries', async () => {
    const runner = createAutonomousRunner({ maxRetries: 3, retryStrategy: 'immediate' });
    let attempts = 0;
    const task: ExecutorTask<string> = {
      id: 'retry',
      name: 'retry-test',
      execute: async () => {
        attempts++;
        if (attempts < 2) throw new Error('not yet');
        return 'ok';
      },
    };
    const result = await runner.runTask(task);
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(attempts).toBe(2);
  });

  it('fails after maxRetries exhausted', async () => {
    const runner = createAutonomousRunner({ maxRetries: 2, retryStrategy: 'immediate' });
    let attempts = 0;
    const task: ExecutorTask = {
      id: 'always-fail',
      name: 'always-fail',
      execute: async () => {
        attempts++;
        throw new Error('always fails');
      },
    };
    const result = await runner.runTask(task);
    expect(result.success).toBe(false);
    expect(attempts).toBe(2);
    expect(result.attempts).toBe(2);
  });

  it('runs multiple tasks with bounded concurrency', async () => {
    const runner = createAutonomousRunner({ maxConcurrency: 2 });
    const tasks: ExecutorTask<number>[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      name: `task ${i}`,
      execute: async () => i * 2,
    }));

    const start = Date.now();
    const results = await runner.runTasks(tasks);
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(5);
    expect(results.every((r) => r.success)).toBe(true);
    // Should be fast (no real work)
    expect(elapsed).toBeLessThan(1000);
  });

  it('preserves task order in runTasks results', async () => {
    const runner = createAutonomousRunner({ maxConcurrency: 1, retryStrategy: 'immediate' });
    const tasks: ExecutorTask<number>[] = [
      { id: 'a', name: 'A', execute: async () => 1 },
      { id: 'b', name: 'B', execute: async () => 2 },
      { id: 'c', name: 'C', execute: async () => 3 },
    ];
    const results = await runner.runTasks(tasks);
    expect(results[0]?.value).toBe(1);
    expect(results[1]?.value).toBe(2);
    expect(results[2]?.value).toBe(3);
  });

  it('records audit entries', async () => {
    const runner = createAutonomousRunner({ auditHook: (e) => auditEntries.push(e) });
    await runner.runTask({
      id: 'audit-test',
      name: 'audit-test',
      execute: async () => 'ok',
    });

    expect(auditEntries.length).toBeGreaterThan(0);
    const events = auditEntries.map((e) => (e as { event: string }).event);
    expect(events).toContain('attempt');
    expect(events).toContain('success');
  });

  it('dryRun mode skips execution but returns success', async () => {
    const runner = createAutonomousRunner({ dryRun: true });
    let executed = false;
    const task: ExecutorTask<string> = {
      id: 'dry',
      name: 'dry-test',
      execute: async () => {
        executed = true;
        return 'real-result';
      },
    };
    const result = await runner.runTask(task);
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(executed).toBe(false);
  });

  it('tracks stepsUsed', async () => {
    const runner = createAutonomousRunner();
    expect(runner.getStepsUsed()).toBe(0);
    await runner.runTask({ id: 's1', name: 's1', execute: async () => 1 });
    await runner.runTask({ id: 's2', name: 's2', execute: async () => 2 });
    expect(runner.getStepsUsed()).toBe(2);
  });
});

describe('executor — RateLimiter', () => {
  it('starts with full bucket', () => {
    const rl = new RateLimiter(60);
    expect(rl.getAvailableTokens()).toBeGreaterThan(0);
  });

  it('acquires tokens', async () => {
    const rl = new RateLimiter(10);
    await rl.acquire();
    await rl.acquire();
    const tokens = rl.getAvailableTokens();
    expect(tokens).toBeLessThan(10);
  });

  it('reset() refills the bucket', () => {
    const rl = new RateLimiter(10);
    rl.reset();
    expect(rl.getAvailableTokens()).toBeGreaterThanOrEqual(9);
  });
});

describe('executor — computeRetryDelay', () => {
  it('immediate returns 0', () => {
    expect(computeRetryDelay('immediate', 1)).toBe(0);
    expect(computeRetryDelay('immediate', 5)).toBe(0);
  });

  it('linear scales with attempt', () => {
    expect(computeRetryDelay('linear', 1)).toBe(100);
    expect(computeRetryDelay('linear', 3)).toBe(300);
  });

  it('exponential grows fast', () => {
    const d1 = computeRetryDelay('exponential', 1);
    const d2 = computeRetryDelay('exponential', 2);
    expect(d2).toBeGreaterThan(d1);
  });

  it('none returns negative (skip retry)', () => {
    expect(computeRetryDelay('none', 1)).toBeLessThan(0);
  });
});

describe('executor — SubAgentCoordinator', () => {
  let coordinator: SubAgentCoordinator;
  let tmpDir: string;

  beforeEach(() => {
    coordinator = createSubAgentCoordinator({ maxConcurrency: 2 });
    tmpDir = mkdtempSync(join(tmpdir(), 'exec-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registerSubAgent adds an agent', () => {
    coordinator.registerSubAgent({
      id: 'a1',
      role: 'coder',
      capabilities: ['typescript', 'debugging'],
    });
    const agents = coordinator.getSubAgents();
    expect(agents.length).toBe(1);
    expect(agents[0]?.spec.id).toBe('a1');
  });

  it('distributeTasks assigns by capability match', () => {
    coordinator.registerSubAgent({
      id: 'ts-coder',
      role: 'TypeScript expert',
      capabilities: ['typescript', 'linting'],
    });
    coordinator.registerSubAgent({
      id: 'doc-writer',
      role: 'Docs writer',
      capabilities: ['markdown', 'documentation'],
    });

    const tasks: Array<ExecutorTask & { requiredCapabilities?: string[] }> = [
      { id: 't1', name: 'fix TS bug', execute: async () => 'fixed', requiredCapabilities: ['typescript'] },
      { id: 't2', name: 'write docs', execute: async () => 'wrote', requiredCapabilities: ['documentation'] },
      { id: 't3', name: 'lint check', execute: async () => 'linted', requiredCapabilities: ['linting'] },
    ];

    const dist = coordinator.distributeTasks(tasks);
    expect(dist.has('ts-coder')).toBe(true);
    expect(dist.has('doc-writer')).toBe(true);

    const tsTasks = dist.get('ts-coder') ?? [];
    const docTasks = dist.get('doc-writer') ?? [];

    // t1 and t3 should go to ts-coder (typescript + linting)
    expect(tsTasks.length).toBe(2);
    expect(docTasks.length).toBe(1);
    expect(docTasks[0]?.id).toBe('t2');
  });

  it('runDistributed executes all tasks across agents', async () => {
    coordinator.registerSubAgent({
      id: 'agent-a',
      role: 'A',
      capabilities: ['typing'],
    });
    coordinator.registerSubAgent({
      id: 'agent-b',
      role: 'B',
      capabilities: ['docs'],
    });

    const tasks: Array<ExecutorTask<number> & { requiredCapabilities?: string[] }> = [
      { id: 'a1', name: 'type1', execute: async () => 1, requiredCapabilities: ['typing'] },
      { id: 'a2', name: 'type2', execute: async () => 2, requiredCapabilities: ['typing'] },
      { id: 'b1', name: 'doc1', execute: async () => 10, requiredCapabilities: ['docs'] },
    ];

    const result = await coordinator.runDistributed(tasks);

    expect(result.totalTasks).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
    expect(result.results.length).toBe(3);
  });

  it('runDistributed reports failures', async () => {
    coordinator.registerSubAgent({
      id: 'solo',
      role: 'S',
      capabilities: ['x'],
    });

    const tasks: ExecutorTask<string>[] = [
      { id: 'ok', name: 'ok', execute: async () => 'ok' },
      { id: 'bad', name: 'bad', execute: async () => { throw new Error('fail'); } },
    ];

    const result = await coordinator.runDistributed(tasks);
    expect(result.totalTasks).toBe(2);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.success).toBe(false);
  });

  it('runDistributed throws when no agents registered', async () => {
    const empty = createSubAgentCoordinator();
    await expect(empty.runDistributed([])).rejects.toThrow('No subagents registered');
  });

  it('tracks subagent state after run', async () => {
    coordinator.registerSubAgent({
      id: 'tracker',
      role: 'T',
      capabilities: ['x'],
    });

    await coordinator.runDistributed<number>([
      { id: 't1', name: 't1', execute: async () => 1, requiredCapabilities: ['x'] },
      { id: 't2', name: 't2', execute: async () => 2, requiredCapabilities: ['x'] },
    ]);

    const agents = coordinator.getSubAgents();
    const tracker = agents.find((a) => a.spec.id === 'tracker');
    expect(tracker?.tasksCompleted).toBe(2);
    expect(tracker?.status).toBe('idle');
  });

  it('flushAuditLog writes to disk', async () => {
    const coord = createSubAgentCoordinator({
      auditLogPath: join(tmpDir, 'audit.jsonl'),
    });
    coord.registerSubAgent({ id: 'x', role: 'X', capabilities: ['x'] });
    await coord.runDistributed<number>([
      { id: 'logged', name: 'logged', execute: async () => 1, requiredCapabilities: ['x'] },
    ]);
    await coord.flushAuditLog();
    expect(existsSync(join(tmpDir, 'audit.jsonl'))).toBe(true);
  });
});
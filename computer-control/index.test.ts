import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createComputerControl,
  createWorkflows,
  buildWorkflow,
  WorkflowBuilder,
  WorkflowRegistry,
  DefaultComputerControl,
  ActionRateLimiter,
  type ComputerControl,
  type AutomationWorkflow,
} from './index';

describe('computer-control — createComputerControl', () => {
  it('returns ComputerControl instance', () => {
    const cc = createComputerControl();
    expect(cc.ready).toBe(true);
    expect(typeof cc.click).toBe('function');
    expect(typeof cc.type).toBe('function');
    expect(typeof cc.screenshot).toBe('function');
  });

  it('dryRun mode is enabled by default', async () => {
    const cc = createComputerControl();
    const result = await cc.click({ x: 100, y: 200 });
    expect(result.success).toBe(true);
    expect(result.data?.dryRun).toBe(true);
  });
});

describe('computer-control — DefaultComputerControl actions', () => {
  let cc: ComputerControl;

  beforeEach(() => {
    cc = createComputerControl({ dryRun: true });
  });

  it('click executes successfully', async () => {
    const r = await cc.click({ x: 50, y: 50 });
    expect(r.success).toBe(true);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('move executes successfully', async () => {
    const r = await cc.move({ x: 10, y: 20 });
    expect(r.success).toBe(true);
  });

  it('scroll executes successfully', async () => {
    const r = await cc.scroll({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(r.success).toBe(true);
  });

  it('type executes successfully', async () => {
    const r = await cc.type('hello world');
    expect(r.success).toBe(true);
  });

  it('pressKey executes successfully', async () => {
    const r = await cc.pressKey('Ctrl+C');
    expect(r.success).toBe(true);
  });

  it('wait executes successfully', async () => {
    const r = await cc.wait(50);
    expect(r.success).toBe(true);
  });

  it('screenshot executes successfully', async () => {
    const r = await cc.screenshot({ outputPath: '/tmp/test.png' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid coordinates', async () => {
    const r = await cc.click({ x: -1, y: 50 });
    expect(r.success).toBe(false);
  });

  it('rejects invalid wait ms', async () => {
    const r = await cc.wait(-100);
    expect(r.success).toBe(false);
  });
});

describe('computer-control — cursor + screen', () => {
  it('getCursorPosition returns default 0,0', async () => {
    const cc = createComputerControl();
    const p = await cc.getCursorPosition();
    expect(p).toHaveProperty('x');
    expect(p).toHaveProperty('y');
  });

  it('getScreenSize returns default', async () => {
    const cc = createComputerControl();
    const size = await cc.getScreenSize();
    expect(size).toHaveProperty('width');
    expect(size).toHaveProperty('height');
    expect(size.width).toBeGreaterThan(0);
  });
});

describe('computer-control — runWorkflow', () => {
  it('runs a workflow with multiple steps', async () => {
    const cc = createComputerControl({ dryRun: true });
    const workflow = buildWorkflow('w1', 'Test workflow', 'demo', (b) => {
      b.click('s1', 100, 100);
      b.type('s2', 'hello');
      b.wait('s3', 10);
    });

    const result = await cc.runWorkflow(workflow);
    expect(result.totalSteps).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
  });

  it('returns failed step on error', async () => {
    const cc = createComputerControl({ dryRun: true });
    const workflow: AutomationWorkflow = {
      id: 'w2',
      name: 'broken',
      description: '',
      steps: [
        { id: 'good', name: 'good', action: { type: 'click', point: { x: 1, y: 1 }, button: 'left', count: 1 } },
        { id: 'bad', name: 'bad', action: { type: 'click', point: { x: -1, y: -1 }, button: 'left', count: 1 }, onError: 'abort' },
      ],
      createdAt: Date.now(),
    };

    const result = await cc.runWorkflow(workflow);
    expect(result.totalSteps).toBe(2);
    expect(result.failed).toBeGreaterThanOrEqual(1);
  });

  it('retries failed steps', async () => {
    const cc = createComputerControl({ dryRun: true });
    const workflow: AutomationWorkflow = {
      id: 'w3',
      name: 'retry',
      description: '',
      steps: [
        { id: 'retry-step', name: 'retry', action: { type: 'click', point: { x: -1, y: -1 }, button: 'left', count: 1 }, retries: 2 },
      ],
      createdAt: Date.now(),
    };

    const result = await cc.runWorkflow(workflow);
    expect(result.results[0]?.stepId).toBe('retry-step');
  });
});

describe('computer-control — audit log', () => {
  it('records actions to audit log', async () => {
    const cc = createComputerControl({ dryRun: true });
    await cc.click({ x: 0, y: 0 });
    await cc.type('test');
    const log = cc.getAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it('flushAuditLog writes to file', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cc-audit-'));
    try {
      const cc = createComputerControl({ auditLogPath: join(tmp, 'audit.jsonl') });
      await cc.click({ x: 0, y: 0 });
      await cc.flushAuditLog();
      expect(existsSync(join(tmp, 'audit.jsonl'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('computer-control — ActionRateLimiter', () => {
  it('starts with full bucket', () => {
    const rl = new ActionRateLimiter(60);
    expect(rl.getAvailable()).toBeGreaterThan(0);
  });

  it('acquires tokens', async () => {
    const rl = new ActionRateLimiter(10);
    await rl.acquire();
    await rl.acquire();
    expect(rl.getAvailable()).toBeLessThan(10);
  });

  it('reset refills', () => {
    const rl = new ActionRateLimiter(10);
    rl.reset();
    expect(rl.getAvailable()).toBeGreaterThanOrEqual(9);
  });
});

describe('computer-control — WorkflowBuilder', () => {
  it('builds a workflow fluently', () => {
    const wf = new WorkflowBuilder('wf1', 'Test', 'desc')
      .click('c1', 10, 10)
      .type('t1', 'hello')
      .pressKey('k1', 'Enter')
      .wait('w1', 100)
      .build();

    expect(wf.id).toBe('wf1');
    expect(wf.steps.length).toBe(4);
    expect(wf.steps[0]?.action.type).toBe('click');
    expect(wf.steps[1]?.action.type).toBe('type');
    expect(wf.steps[2]?.action.type).toBe('key');
    expect(wf.steps[3]?.action.type).toBe('wait');
  });

  it('adds screenshot step', () => {
    const wf = new WorkflowBuilder('wf2', 'Shot').screenshot('s1', '/tmp/x.png').build();
    expect(wf.steps[0]?.action.type).toBe('screenshot');
  });

  it('sets error handling', () => {
    const wf = new WorkflowBuilder('wf3', 'Err').click('c1', 0, 0, { onError: 'retry', retries: 2 }).build();
    expect(wf.steps[0]?.onError).toBe('retry');
    expect(wf.steps[0]?.retries).toBe(2);
  });
});

describe('computer-control — WorkflowRegistry', () => {
  let registry: WorkflowRegistry;

  beforeEach(() => {
    registry = createWorkflows();
  });

  it('register + get', () => {
    const wf: AutomationWorkflow = {
      id: 'r1', name: 'R1', description: '', steps: [], createdAt: Date.now(),
    };
    registry.register(wf);
    expect(registry.get('r1')?.name).toBe('R1');
  });

  it('list returns all', () => {
    registry.register({ id: 'a', name: 'A', description: '', steps: [], createdAt: 0 });
    registry.register({ id: 'b', name: 'B', description: '', steps: [], createdAt: 0 });
    expect(registry.list().length).toBe(2);
  });

  it('remove deletes workflow', () => {
    registry.register({ id: 'rm', name: 'Rm', description: '', steps: [], createdAt: 0 });
    expect(registry.remove('rm')).toBe(true);
    expect(registry.get('rm')).toBeNull();
  });

  it('clear removes all', () => {
    registry.register({ id: 'a', name: 'A', description: '', steps: [], createdAt: 0 });
    registry.clear();
    expect(registry.size()).toBe(0);
  });

  it('persists to disk', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wf-reg-'));
    try {
      const reg = createWorkflows(join(tmp, 'wf.json'));
      reg.register({ id: 'persisted', name: 'P', description: '', steps: [], createdAt: 0 });
      const reg2 = createWorkflows(join(tmp, 'wf.json'));
      expect(reg2.get('persisted')?.name).toBe('P');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
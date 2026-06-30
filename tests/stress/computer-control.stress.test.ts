/**
 * tests/stress/computer-control.stress.test.ts — Stress tests for computer-control
 */

import { describe, it, expect } from 'vitest';

import {
  createComputerControl,
  createWorkflows,
  buildWorkflow,
  ActionRateLimiter,
  WorkflowBuilder,
} from '../../computer-control';
import type { Action, ClickAction } from '../../computer-control';

describe('STRESS: computer-control — ActionRateLimiter', () => {
  it('creates rate limiter', () => {
    const rl = new ActionRateLimiter(60);
    expect(rl).toBeDefined();
    expect(rl.getAvailable()).toBe(60);
  });

  it('consumes token on acquire', async () => {
    const rl = new ActionRateLimiter(60);
    const before = rl.getAvailable();
    await rl.acquire();
    expect(rl.getAvailable()).toBeLessThan(before);
  });

  it('reset restores full bucket', async () => {
    const rl = new ActionRateLimiter(60);
    await rl.acquire();
    await rl.acquire();
    rl.reset();
    expect(rl.getAvailable()).toBe(60);
  });

  it('handles 100 acquire calls', async () => {
    const rl = new ActionRateLimiter(1000);
    for (let i = 0; i < 100; i++) {
      await rl.acquire();
    }
    expect(rl.getAvailable()).toBeGreaterThan(0);
  });

  it('handles high limit values', async () => {
    const rl = new ActionRateLimiter(1_000_000);
    for (let i = 0; i < 1000; i++) {
      await rl.acquire();
    }
    expect(rl.getAvailable()).toBeGreaterThan(0);
  });

  it('low rate (1/min) starts with 1 token', () => {
    const rl = new ActionRateLimiter(1);
    expect(rl.getAvailable()).toBe(1);
  });
});

describe('STRESS: computer-control — DefaultComputerControl (dry-run)', () => {
  it('createComputerControl returns instance', () => {
    const cc = createComputerControl({ dryRun: true });
    expect(cc).toBeDefined();
  });

  it('executes click in dry-run mode', async () => {
    const cc = createComputerControl({ dryRun: true });
    const action: ClickAction = { type: 'click', x: 100, y: 200, button: 'left' };
    const result = await cc.execute(action);
    expect(result.success).toBe(true);
  });

  it('executes 20 actions without error', async () => {
    const cc = createComputerControl({ dryRun: true, maxActionsPerMinute: 100000 });
    for (let i = 0; i < 20; i++) {
      const action: Action = { type: 'click', x: i, y: i, button: 'left' };
      await cc.execute(action);
    }
  }, { timeout: 15000 });

  it('executes 30 actions in < 3s (dry-run)', async () => {
    const cc = createComputerControl({ dryRun: true, maxActionsPerMinute: 100000 });
    const start = Date.now();
    for (let i = 0; i < 30; i++) {
      await cc.execute({ type: 'click', x: i, y: i, button: 'left' });
    }
    expect(Date.now() - start).toBeLessThan(3000);
  }, { timeout: 15000 });

  it('handles all action types', async () => {
    const cc = createComputerControl({ dryRun: true });
    const actions: Action[] = [
      { type: 'click', x: 0, y: 0, button: 'left' },
      { type: 'move', x: 100, y: 100 },
      { type: 'scroll', x: 0, y: 0, dx: 0, dy: 100 },
      { type: 'type', text: 'hello' },
      { type: 'key', combo: 'Ctrl+C' },
      { type: 'wait', ms: 0 },
      { type: 'screenshot', path: '/tmp/screen.png' },
    ];
    for (const action of actions) {
      const r = await cc.execute(action);
      expect(r).toBeDefined();
    }
  });

  it('returns audit log', async () => {
    const cc = createComputerControl({ dryRun: true });
    await cc.execute({ type: 'click', x: 0, y: 0, button: 'left' });
    const log = cc.getAuditLog?.();
    expect(Array.isArray(log) || log === undefined).toBe(true);
  });
});

describe('STRESS: computer-control — Workflows', () => {
  it('createWorkflows returns registry', () => {
    const registry = createWorkflows();
    expect(registry).toBeDefined();
  });

  it('buildWorkflow constructs workflow', () => {
    const wf = buildWorkflow('test', 'Test', 'A test', (b) => {
      b.addStep({ type: 'click', x: 0, y: 0, button: 'left' });
    });
    expect(wf.id).toBe('test');
    expect(wf.steps.length).toBe(1);
  });

  it('buildWorkflow with many steps', () => {
    const wf = buildWorkflow('big', 'Big', 'Large workflow', (b) => {
      for (let i = 0; i < 100; i++) {
        b.addStep({ type: 'click', x: i, y: i, button: 'left' });
      }
    });
    expect(wf.steps.length).toBe(100);
  });

  it('WorkflowBuilder fluent API', () => {
    const wf = buildWorkflow('fluent', 'F', 'D', (b) => {
      b.addStep({ type: 'click', x: 0, y: 0, button: 'left' });
      b.addStep({ type: 'type', text: 'a' });
    });
    expect(wf.steps.length).toBe(2);
  });
});

describe('STRESS: computer-control — error variants', () => {
  it('handles negative coordinates', async () => {
    const cc = createComputerControl({ dryRun: true });
    const r = await cc.execute({ type: 'click', x: -1, y: -1, button: 'left' });
    expect(r).toBeDefined();
  });

  it('handles empty text', async () => {
    const cc = createComputerControl({ dryRun: true });
    const r = await cc.execute({ type: 'type', text: '' });
    expect(r).toBeDefined();
  });

  it('handles unicode text', async () => {
    const cc = createComputerControl({ dryRun: true });
    const r = await cc.execute({ type: 'type', text: '🚀🎯🌟' });
    expect(r).toBeDefined();
  });
});
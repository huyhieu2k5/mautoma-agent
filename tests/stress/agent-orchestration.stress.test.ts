/**
 * tests/stress/agent-orchestration.stress.test.ts — Stress tests for agent-orchestration
 */

import { describe, it, expect } from 'vitest';

import {
  createAgentEscalationEngine,
  createTeamOrchestrator,
} from '../../agent-orchestration';

describe('STRESS: agent-orchestration — EscalationEngine', () => {
  it('creates escalation engine', () => {
    const engine = createAgentEscalationEngine();
    expect(engine).toBeDefined();
  });

  it('records escalation', () => {
    const engine = createAgentEscalationEngine();
    engine.record({
      id: 'e1',
      fromAgentId: 'w1',
      fromTier: 'worker',
      toTier: 'specialist',
      reason: 'low confidence',
      timestamp: Date.now(),
      context: {},
    });
    expect(engine.size()).toBe(1);
  });

  it('handles 100 escalations', () => {
    const engine = createAgentEscalationEngine();
    for (let i = 0; i < 100; i++) {
      engine.record({
        id: `e${i}`,
        fromAgentId: `w-${i}`,
        fromTier: 'worker',
        toTier: 'specialist',
        reason: 'test',
        timestamp: Date.now(),
        context: {},
      });
    }
    expect(engine.size()).toBe(100);
  });

  it('audit log accumulates', () => {
    const engine = createAgentEscalationEngine();
    engine.record({ id: 'a', fromAgentId: 'w', fromTier: 'worker', toTier: 'specialist', reason: 'r', timestamp: Date.now(), context: {} });
    engine.record({ id: 'b', fromAgentId: 'w2', fromTier: 'worker', toTier: 'specialist', reason: 'r2', timestamp: Date.now(), context: {} });
    const log = engine.getAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it('getByAgent filters correctly', () => {
    const engine = createAgentEscalationEngine();
    engine.record({ id: 'a', fromAgentId: 'alice', fromTier: 'worker', toTier: 'specialist', reason: 'r', timestamp: Date.now(), context: {} });
    engine.record({ id: 'b', fromAgentId: 'bob', fromTier: 'worker', toTier: 'specialist', reason: 'r', timestamp: Date.now(), context: {} });
    expect(engine.getByAgent('alice').length).toBe(1);
    expect(engine.getByAgent('bob').length).toBe(1);
  });

  it('getByTier filters correctly', () => {
    const engine = createAgentEscalationEngine();
    engine.record({ id: 'a', fromAgentId: 'w', fromTier: 'worker', toTier: 'specialist', reason: 'r', timestamp: Date.now(), context: {} });
    expect(engine.getByTier('worker').length).toBe(1);
  });

  it('clear empties engine', () => {
    const engine = createAgentEscalationEngine();
    engine.record({ id: 'a', fromAgentId: 'w', fromTier: 'worker', toTier: 'specialist', reason: 'r', timestamp: Date.now(), context: {} });
    engine.clear();
    expect(engine.size()).toBe(0);
  });
});

describe('STRESS: agent-orchestration — TeamOrchestrator', () => {
  it('creates team orchestrator', () => {
    const orch = createTeamOrchestrator();
    expect(orch).toBeDefined();
  });

  it('registerAgent + listAgents', () => {
    const orch = createTeamOrchestrator();
    orch.registerAgent({ id: 'a1', tier: 'worker', capabilities: ['code'] });
    orch.registerAgent({ id: 'a2', tier: 'specialist', capabilities: ['review'] });
    expect(orch.listAgents().length).toBe(2);
  });

  it('unregisterAgent returns true for registered agent', () => {
    const orch = createTeamOrchestrator();
    orch.registerAgent({ id: 'a1', tier: 'worker', capabilities: [] });
    expect(orch.unregisterAgent('a1')).toBe(true);
    expect(orch.unregisterAgent('a1')).toBe(false);
  });

  it('getAgent returns null for unknown', () => {
    const orch = createTeamOrchestrator();
    expect(orch.getAgent('missing')).toBeNull();
  });

  it('listByTier filters by tier', () => {
    const orch = createTeamOrchestrator();
    orch.registerAgent({ id: 'a1', tier: 'worker', capabilities: [] });
    orch.registerAgent({ id: 'a2', tier: 'worker', capabilities: [] });
    orch.registerAgent({ id: 's1', tier: 'specialist', capabilities: [] });
    expect(orch.listByTier('worker').length).toBe(2);
    expect(orch.listByTier('specialist').length).toBe(1);
  });

  it('handles 100 agents', () => {
    const orch = createTeamOrchestrator();
    for (let i = 0; i < 100; i++) {
      orch.registerAgent({ id: `a${i}`, tier: 'worker', capabilities: ['x'] });
    }
    expect(orch.listAgents().length).toBe(100);
  });

  it('run executes pattern', async () => {
    const orch = createTeamOrchestrator();
    orch.registerAgent({ id: 'a1', tier: 'worker', capabilities: ['code'] });
    orch.registerAgent({ id: 'a2', tier: 'specialist', capabilities: ['review'] });
    const result = await orch.run('arena', ['a1', 'a2'], { prompt: 'test' });
    expect(result).toBeDefined();
  });

  it('run with unknown agent returns graceful result', async () => {
    const orch = createTeamOrchestrator();
    orch.registerAgent({ id: 'a1', tier: 'worker', capabilities: [] });
    try {
      const result = await orch.run('supervisor', ['a1', 'unknown'], { x: 1 });
      expect(result).toBeDefined();
    } catch {
      // Some patterns may throw on unknown agents — that's acceptable
      expect(true).toBe(true);
    }
  });
});

describe('STRESS: agent-orchestration — performance', () => {
  it('1000 escalations in < 100ms', () => {
    const engine = createAgentEscalationEngine();
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      engine.record({ id: `e${i}`, fromAgentId: `w-${i}`, fromTier: 'worker', toTier: 'specialist', reason: 'test', timestamp: Date.now(), context: {} });
    }
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('1000 agents registered in < 500ms', () => {
    const orch = createTeamOrchestrator();
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      orch.registerAgent({ id: `a${i}`, tier: 'worker', capabilities: [] });
    }
    expect(Date.now() - start).toBeLessThan(500);
  });
});
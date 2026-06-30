import { describe, it, expect, beforeEach } from 'vitest';

import {
  createAgentEscalationEngine,
  createTeamOrchestrator,
  tierRank,
  tierAbove,
  tierBelow,
  canEscalate,
  getTiersAbove,
  getTiersBelow,
  tierCapabilities,
  validateTierInvariant,
  TIER_ORDER,
  EscalationEngine,
  shouldEscalate,
  getEscalationTarget,
  validateEscalation,
  createEscalation,
  TeamOrchestrator,
  runArena,
  runInterrogate,
  runSupervisor,
  runHierarchical,
  type AgentSpec,
  type AgentDecision,
} from './index';

describe('agent-orchestration — tierRank', () => {
  it('orders tiers correctly', () => {
    expect(tierRank('WORKER')).toBe(0);
    expect(tierRank('SPECIALIST')).toBe(1);
    expect(tierRank('MANAGER')).toBe(2);
    expect(tierRank('EXECUTIVE')).toBe(3);
    expect(tierRank('SUPREME')).toBe(4);
  });
});

describe('agent-orchestration — tierAbove/tierBelow', () => {
  it('returns next tier above', () => {
    expect(tierAbove('WORKER')).toBe('SPECIALIST');
    expect(tierAbove('SPECIALIST')).toBe('MANAGER');
    expect(tierAbove('MANAGER')).toBe('EXECUTIVE');
    expect(tierAbove('EXECUTIVE')).toBe('SUPREME');
    expect(tierAbove('SUPREME')).toBeNull();
  });

  it('returns tier below', () => {
    expect(tierBelow('SUPREME')).toBe('EXECUTIVE');
    expect(tierBelow('WORKER')).toBeNull();
  });
});

describe('agent-orchestration — canEscalate', () => {
  it('allows 1-step escalation', () => {
    expect(canEscalate('WORKER', 'SPECIALIST')).toBe(true);
    expect(canEscalate('SPECIALIST', 'MANAGER')).toBe(true);
  });

  it('allows 2-step escalation', () => {
    expect(canEscalate('WORKER', 'MANAGER')).toBe(true);
  });

  it('rejects 3-step escalation', () => {
    expect(canEscalate('WORKER', 'EXECUTIVE')).toBe(false);
    expect(canEscalate('WORKER', 'SUPREME')).toBe(false);
  });

  it('rejects downward or same-tier', () => {
    expect(canEscalate('SPECIALIST', 'WORKER')).toBe(false);
    expect(canEscalate('MANAGER', 'MANAGER')).toBe(false);
  });
});

describe('agent-orchestration — getTiersAbove/Below', () => {
  it('lists tiers above', () => {
    expect(getTiersAbove('WORKER')).toEqual(['SPECIALIST', 'MANAGER', 'EXECUTIVE', 'SUPREME']);
    expect(getTiersAbove('SUPREME')).toEqual([]);
  });

  it('lists tiers below', () => {
    expect(getTiersBelow('SUPREME')).toEqual(['WORKER', 'SPECIALIST', 'MANAGER', 'EXECUTIVE']);
    expect(getTiersBelow('WORKER')).toEqual([]);
  });
});

describe('agent-orchestration — tierCapabilities', () => {
  it('WORKER has minimal capabilities', () => {
    const caps = tierCapabilities('WORKER');
    expect(caps).toContain('execute-task');
    expect(caps).not.toContain('veto');
    expect(caps).not.toContain('override');
  });

  it('EXECUTIVE has veto power', () => {
    expect(tierCapabilities('EXECUTIVE')).toContain('veto');
    expect(tierCapabilities('EXECUTIVE')).toContain('override');
  });

  it('SUPREME has final-authority', () => {
    expect(tierCapabilities('SUPREME')).toContain('final-authority');
  });
});

describe('agent-orchestration — validateTierInvariant', () => {
  it('allows valid tier actions', () => {
    expect(validateTierInvariant('WORKER', 'execute-task')).toBe(true);
    expect(validateTierInvariant('EXECUTIVE', 'veto')).toBe(true);
  });

  it('rejects invalid tier actions', () => {
    expect(validateTierInvariant('WORKER', 'veto')).toBe(false);
    expect(validateTierInvariant('WORKER', 'override')).toBe(false);
  });
});

describe('agent-orchestration — TIER_ORDER', () => {
  it('has 5 tiers in order', () => {
    expect(TIER_ORDER).toEqual(['WORKER', 'SPECIALIST', 'MANAGER', 'EXECUTIVE', 'SUPREME']);
  });
});

describe('agent-orchestration — shouldEscalate', () => {
  it('returns true on low confidence', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.7, canEscalate: true,
    };
    const decision: AgentDecision = {
      agentId: 'a', tier: 'WORKER', confidence: 0.3, notes: [], shouldEscalate: false,
    };
    expect(shouldEscalate(decision, agent)).toBe(true);
  });

  it('returns false on high confidence', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.7, canEscalate: true,
    };
    const decision: AgentDecision = {
      agentId: 'a', tier: 'WORKER', confidence: 0.9, notes: [], shouldEscalate: false,
    };
    expect(shouldEscalate(decision, agent)).toBe(false);
  });

  it('returns false when agent cannot escalate', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.7, canEscalate: false,
    };
    const decision: AgentDecision = {
      agentId: 'a', tier: 'WORKER', confidence: 0.1, notes: [], shouldEscalate: false,
    };
    expect(shouldEscalate(decision, agent)).toBe(false);
  });

  it('returns true when shouldEscalate flag set', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.7, canEscalate: true,
    };
    const decision: AgentDecision = {
      agentId: 'a', tier: 'WORKER', confidence: 0.9, notes: [], shouldEscalate: true,
    };
    expect(shouldEscalate(decision, agent)).toBe(true);
  });
});

describe('agent-orchestration — getEscalationTarget', () => {
  it('returns next tier above', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true,
    };
    expect(getEscalationTarget(agent)).toBe('SPECIALIST');
  });

  it('returns null for SUPREME', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'SUPREME', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true,
    };
    expect(getEscalationTarget(agent)).toBeNull();
  });
});

describe('agent-orchestration — validateEscalation', () => {
  it('validates allowed escalations', () => {
    expect(validateEscalation('WORKER', 'SPECIALIST')).toBe(true);
  });

  it('rejects invalid escalations', () => {
    expect(validateEscalation('WORKER', 'SUPREME')).toBe(false);
  });
});

describe('agent-orchestration — createEscalation', () => {
  it('creates an event for valid escalation', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true,
    };
    const event = createEscalation(agent, 'low confidence');
    expect(event.fromTier).toBe('WORKER');
    expect(event.toTier).toBe('SPECIALIST');
    expect(event.reason).toBe('low confidence');
  });

  it('throws on invalid escalation', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true,
    };
    expect(() => createEscalation(agent, 'test', 'SUPREME')).toThrow();
  });

  it('throws for SUPREME escalation', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'SUPREME', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true,
    };
    expect(() => createEscalation(agent, 'test')).toThrow();
  });
});

describe('agent-orchestration — EscalationEngine', () => {
  let engine: EscalationEngine;

  beforeEach(() => {
    engine = createAgentEscalationEngine();
  });

  it('records and retrieves escalations', () => {
    const agent: AgentSpec = {
      id: 'a', name: 'A', tier: 'WORKER', capabilities: [],
      stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true,
    };
    const event = createEscalation(agent, 'low conf');
    engine.record(event);
    expect(engine.size()).toBe(1);
    expect(engine.getEscalations().length).toBe(1);
  });

  it('filters by agent', () => {
    const agent1: AgentSpec = { id: 'a1', name: 'A1', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    const agent2: AgentSpec = { id: 'a2', name: 'A2', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    engine.record(createEscalation(agent1, 'r1'));
    engine.record(createEscalation(agent2, 'r2'));
    expect(engine.getByAgent('a1').length).toBe(1);
  });

  it('filters by tier', () => {
    const worker: AgentSpec = { id: 'w', name: 'W', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    const specialist: AgentSpec = { id: 's', name: 'S', tier: 'SPECIALIST', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    engine.record(createEscalation(worker, 'r1'));
    engine.record(createEscalation(specialist, 'r2'));
    expect(engine.getByTier('WORKER').length).toBe(1);
    expect(engine.getByTier('SPECIALIST').length).toBe(1);
  });

  it('audit log is recorded', () => {
    const agent: AgentSpec = { id: 'a', name: 'A', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    engine.record(createEscalation(agent, 'r'));
    expect(engine.getAuditLog().length).toBe(1);
  });

  it('clear removes all', () => {
    const agent: AgentSpec = { id: 'a', name: 'A', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    engine.record(createEscalation(agent, 'r'));
    engine.clear();
    expect(engine.size()).toBe(0);
  });
});

describe('agent-orchestration — TeamOrchestrator', () => {
  let orchestrator: TeamOrchestrator;

  beforeEach(() => {
    orchestrator = createTeamOrchestrator();
  });

  it('registerAgent and getAgent', () => {
    const agent: AgentSpec = { id: 'a', name: 'A', tier: 'WORKER', capabilities: ['x'], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    orchestrator.registerAgent(agent);
    expect(orchestrator.getAgent('a')?.name).toBe('A');
  });

  it('unregisterAgent', () => {
    const agent: AgentSpec = { id: 'a', name: 'A', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    orchestrator.registerAgent(agent);
    expect(orchestrator.unregisterAgent('a')).toBe(true);
    expect(orchestrator.getAgent('a')).toBeNull();
  });

  it('listAgents returns all', () => {
    orchestrator.registerAgent({ id: 'a', name: 'A', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    orchestrator.registerAgent({ id: 'b', name: 'B', tier: 'SPECIALIST', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    expect(orchestrator.listAgents().length).toBe(2);
  });

  it('listByTier filters', () => {
    orchestrator.registerAgent({ id: 'w', name: 'W', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    orchestrator.registerAgent({ id: 'm', name: 'M', tier: 'MANAGER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    expect(orchestrator.listByTier('WORKER').length).toBe(1);
    expect(orchestrator.listByTier('MANAGER').length).toBe(1);
  });

  it('run with empty agents returns failure', async () => {
    const result = await orchestrator.run('arena', [], { foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('run arena pattern', async () => {
    orchestrator.registerAgent({ id: 'a1', name: 'A1', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    orchestrator.registerAgent({ id: 'a2', name: 'A2', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    const result = await orchestrator.run('arena', ['a1', 'a2'], { x: 1 });
    expect(result.pattern).toBe('arena');
  });

  it('run interrogate pattern', async () => {
    orchestrator.registerAgent({ id: 'i1', name: 'I1', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    const result = await orchestrator.run('interrogate', ['i1'], { x: 1 });
    expect(result.pattern).toBe('interrogate');
  });

  it('run supervisor pattern', async () => {
    orchestrator.registerAgent({ id: 's1', name: 'S1', tier: 'MANAGER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    orchestrator.registerAgent({ id: 'sp1', name: 'SP1', tier: 'WORKER', capabilities: ['x'], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    const result = await orchestrator.run('supervisor', ['s1', 'sp1'], { requiredCapabilities: ['x'] });
    expect(result.pattern).toBe('supervisor');
  });

  it('run hierarchical pattern', async () => {
    orchestrator.registerAgent({ id: 'h1', name: 'H1', tier: 'MANAGER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    orchestrator.registerAgent({ id: 'h2', name: 'H2', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true });
    const result = await orchestrator.run('hierarchical', ['h1', 'h2'], { x: 1 });
    expect(result.pattern).toBe('hierarchical');
  });
});

describe('agent-orchestration — team pattern functions', () => {
  it('runArena with multiple candidates', async () => {
    const engine = createAgentEscalationEngine();
    const agents: AgentSpec[] = [
      { id: 'a1', name: 'A1', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
      { id: 'a2', name: 'A2', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
    ];
    const judge: AgentSpec = { id: 'j', name: 'J', tier: 'MANAGER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    const result = await runArena(agents, {}, judge, engine);
    expect(result.candidates?.length).toBe(2);
    expect(result.winner).toBeDefined();
  });

  it('runInterrogate', async () => {
    const engine = createAgentEscalationEngine();
    const agents: AgentSpec[] = [
      { id: 'i1', name: 'I1', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
      { id: 'i2', name: 'I2', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
    ];
    const result = await runInterrogate(agents, {}, engine);
    expect(result.candidates?.length).toBe(2);
  });

  it('runSupervisor matches by capability', async () => {
    const engine = createAgentEscalationEngine();
    const supervisor: AgentSpec = { id: 'sup', name: 'SUP', tier: 'MANAGER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    const specialists: AgentSpec[] = [
      { id: 's1', name: 'S1', tier: 'WORKER', capabilities: ['react'], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
      { id: 's2', name: 'S2', tier: 'WORKER', capabilities: ['python'], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
    ];
    const result = await runSupervisor(supervisor, specialists, { requiredCapabilities: ['react'] }, engine);
    expect(result.winner?.agentId).toBe('s1');
  });

  it('runSupervisor escalates when no match', async () => {
    const engine = createAgentEscalationEngine();
    const supervisor: AgentSpec = { id: 'sup', name: 'SUP', tier: 'MANAGER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    const specialists: AgentSpec[] = [
      { id: 's1', name: 'S1', tier: 'WORKER', capabilities: ['python'], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
    ];
    const result = await runSupervisor(supervisor, specialists, { requiredCapabilities: ['rust'] }, engine);
    expect(result.success).toBe(false);
    expect(result.escalations.length).toBeGreaterThan(0);
  });

  it('runHierarchical with children', async () => {
    const engine = createAgentEscalationEngine();
    const root: AgentSpec = { id: 'r', name: 'R', tier: 'MANAGER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true };
    const children: AgentSpec[] = [
      { id: 'c1', name: 'C1', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
      { id: 'c2', name: 'C2', tier: 'WORKER', capabilities: [], stepBudget: 10, confidenceThreshold: 0.5, canEscalate: true },
    ];
    const result = await runHierarchical(root, children, {}, engine);
    expect(result.candidates?.length).toBe(3);
  });
});
/**
 * agent-orchestration/agent_teams.ts — Team patterns
 *
 * Supports 4 team patterns:
 *  - arena        : N agents run in parallel, judge picks winner
 *  - interrogate  : N agents review each other, voting
 *  - supervisor   : 1 supervisor routes to specialists
 *  - hierarchical : tree execution (parent dispatches to children)
 *
 * Pure logic. Each pattern is a function that takes agents + input,
 * returns TeamExecutionResult.
 */

import type {
  AgentSpec,
  AgentDecision,
  TeamPattern,
  TeamExecutionResult,
  AuthorityTier,
  EscalationEvent,
} from './types';
import { EscalationEngine, createEscalation } from './agent_escalation';

/**
 * Agent function — provided by caller, executes the task
 */
export type AgentFunction = (agent: AgentSpec, input: unknown) => Promise<AgentDecision>;

/**
 * Arena pattern — N candidates, judge picks winner
 */
export async function runArena(
  agents: AgentSpec[],
  input: unknown,
  judge: AgentSpec,
  engine: EscalationEngine
): Promise<TeamExecutionResult> {
  const startTime = Date.now();
  const escalations: EscalationEvent[] = [];

  // All candidates run in parallel
  const candidateResults = await Promise.all(
    agents.map(async (agent) => {
      try {
        const fn = (input as { _fn?: AgentFunction })?._fn;
        const decision = fn ? await fn(agent, input) : await defaultAgentFn(agent, input);

        // Check if any agent wants to escalate
        if (decision.shouldEscalate) {
          const escalation = createEscalation(agent, decision.notes.join('; ') || 'low confidence');
          engine.record(escalation);
          escalations.push(escalation);
        }

        return { agentId: agent.id, result: decision.result, confidence: decision.confidence };
      } catch (err) {
        return { agentId: agent.id, result: null, confidence: 0, error: String(err) };
      }
    })
  );

  // Judge picks the highest-confidence result
  const valid = candidateResults.filter((c) => c.confidence > 0);
  const winner = valid.sort((a, b) => b.confidence - a.confidence)[0];

  return {
    pattern: 'arena',
    candidates: candidateResults,
    winner,
    escalations,
    totalDurationMs: Date.now() - startTime,
    success: winner !== undefined,
  };
}

/**
 * Interrogate pattern — agents review each other's work
 */
export async function runInterrogate(
  agents: AgentSpec[],
  input: unknown,
  engine: EscalationEngine
): Promise<TeamExecutionResult> {
  const startTime = Date.now();
  const escalations: EscalationEvent[] = [];

  // Each agent produces initial work
  const initialResults = await Promise.all(
    agents.map(async (agent) => {
      try {
        const fn = (input as { _fn?: AgentFunction })?._fn;
        const decision = fn ? await fn(agent, input) : await defaultAgentFn(agent, input);
        return { agentId: agent.id, result: decision.result, confidence: decision.confidence, notes: decision.notes };
      } catch (err) {
        return { agentId: agent.id, result: null, confidence: 0, notes: [String(err)] };
      }
    })
  );

  // Voting: each agent votes for the best candidate (round-robin for simplicity)
  const votes = new Map<string, number>();
  for (const voter of agents) {
    let bestCandidate = initialResults[0];
    for (const candidate of initialResults) {
      if (candidate.agentId !== voter.id && candidate.confidence > (bestCandidate?.confidence ?? 0)) {
        bestCandidate = candidate;
      }
    }
    if (bestCandidate) {
      votes.set(bestCandidate.agentId, (votes.get(bestCandidate.agentId) ?? 0) + 1);
    }
  }

  // Winner by votes
  const sorted = Array.from(votes.entries()).sort((a, b) => b[1] - a[1]);
  const winnerId = sorted[0]?.[0];
  const winner = initialResults.find((r) => r.agentId === winnerId);

  return {
    pattern: 'interrogate',
    candidates: initialResults,
    winner,
    escalations,
    totalDurationMs: Date.now() - startTime,
    success: winner !== undefined,
  };
}

/**
 * Supervisor pattern — routes to best-matching specialist
 */
export async function runSupervisor(
  supervisor: AgentSpec,
  specialists: AgentSpec[],
  input: unknown,
  engine: EscalationEngine
): Promise<TeamExecutionResult> {
  const startTime = Date.now();
  const escalations: EscalationEvent[] = [];

  // Score specialists by capability match
  const hints = (input as { requiredCapabilities?: string[] })?.requiredCapabilities ?? [];
  const candidates = specialists
    .map((s) => {
      const matches = hints.filter((h) => s.capabilities.includes(h)).length;
      return { agent: s, score: hints.length === 0 ? 0.5 : matches / hints.length };
    })
    .sort((a, b) => b.score - a.score);

  // Pick the best match (or escalate if no match)
  const best = candidates[0];
  if (!best || best.score === 0) {
    const escalation = createEscalation(supervisor, 'no matching specialist', 'EXECUTIVE');
    engine.record(escalation);
    escalations.push(escalation);

    return {
      pattern: 'supervisor',
      escalations,
      totalDurationMs: Date.now() - startTime,
      success: false,
    };
  }

  // Execute via best specialist
  const fn = (input as { _fn?: AgentFunction })?._fn;
  const decision = fn ? await fn(best.agent, input) : await defaultAgentFn(best.agent, input);

  return {
    pattern: 'supervisor',
    candidates: [{ agentId: best.agent.id, result: decision.result, confidence: decision.confidence }],
    winner: { agentId: best.agent.id, result: decision.result, confidence: decision.confidence },
    escalations,
    totalDurationMs: Date.now() - startTime,
    success: decision.confidence >= best.agent.confidenceThreshold,
  };
}

/**
 * Hierarchical pattern — parent dispatches to children in tree
 */
export async function runHierarchical(
  root: AgentSpec,
  children: AgentSpec[],
  input: unknown,
  engine: EscalationEngine
): Promise<TeamExecutionResult> {
  const startTime = Date.now();
  const escalations: EscalationEvent[] = [];

  // Root agent decides the plan
  const fn = (input as { _fn?: AgentFunction })?._fn;
  const rootDecision = fn ? await fn(root, input) : await defaultAgentFn(root, input);

  if (rootDecision.shouldEscalate) {
    const escalation = createEscalation(root, 'root escalation');
    engine.record(escalation);
    escalations.push(escalation);
  }

  // Children execute in parallel
  const childResults = await Promise.all(
    children.map(async (child) => {
      try {
        const decision = fn ? await fn(child, input) : await defaultAgentFn(child, input);
        return { agentId: child.id, result: decision.result, confidence: decision.confidence };
      } catch (err) {
        return { agentId: child.id, result: null, confidence: 0 };
      }
    })
  );

  // Average confidence of children
  const avgConfidence = childResults.reduce((sum, c) => sum + c.confidence, 0) / Math.max(1, childResults.length);

  return {
    pattern: 'hierarchical',
    candidates: [
      { agentId: root.id, result: rootDecision.result, confidence: rootDecision.confidence },
      ...childResults,
    ],
    winner: { agentId: root.id, result: rootDecision.result, confidence: avgConfidence },
    escalations,
    totalDurationMs: Date.now() - startTime,
    success: avgConfidence > 0.5,
  };
}

/**
 * Default agent function when none provided — produces identity result
 */
async function defaultAgentFn(agent: AgentSpec, input: unknown): Promise<AgentDecision> {
  return {
    agentId: agent.id,
    tier: agent.tier,
    confidence: 0.5,
    result: { agentId: agent.id, input },
    notes: ['default stub'],
    shouldEscalate: false,
  };
}

/**
 * Team orchestrator — top-level entry
 */
export class TeamOrchestrator {
  private agents: Map<string, AgentSpec> = new Map();
  readonly escalationEngine: EscalationEngine;

  constructor() {
    this.escalationEngine = new EscalationEngine();
  }

  registerAgent(spec: AgentSpec): void {
    this.agents.set(spec.id, spec);
  }

  unregisterAgent(id: string): boolean {
    return this.agents.delete(id);
  }

  getAgent(id: string): AgentSpec | null {
    return this.agents.get(id) ?? null;
  }

  listAgents(): AgentSpec[] {
    return Array.from(this.agents.values());
  }

  listByTier(tier: AuthorityTier): AgentSpec[] {
    return Array.from(this.agents.values()).filter((a) => a.tier === tier);
  }

  /**
   * Run a team pattern
   */
  async run(pattern: TeamPattern, agentIds: string[], input: unknown): Promise<TeamExecutionResult> {
    const agents = agentIds.map((id) => this.agents.get(id)).filter((a): a is AgentSpec => a !== undefined);
    if (agents.length === 0) {
      return {
        pattern,
        escalations: [],
        totalDurationMs: 0,
        success: false,
      };
    }

    switch (pattern) {
      case 'arena': {
        const judge = agents[0]!;
        return runArena(agents, input, judge, this.escalationEngine);
      }
      case 'interrogate':
        return runInterrogate(agents, input, this.escalationEngine);
      case 'supervisor': {
        const supervisor = agents[0]!;
        const specialists = agents.slice(1);
        return runSupervisor(supervisor, specialists, input, this.escalationEngine);
      }
      case 'hierarchical': {
        const root = agents[0]!;
        const children = agents.slice(1);
        return runHierarchical(root, children, input, this.escalationEngine);
      }
      default:
        return {
          pattern,
          escalations: [],
          totalDurationMs: 0,
          success: false,
        };
    }
  }
}
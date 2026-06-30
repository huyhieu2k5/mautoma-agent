/**
 * agent-orchestration/agent_escalation.ts — Escalation engine
 *
 * Handles escalations between agent tiers. Pure logic.
 */

import type {
  AgentSpec,
  AgentDecision,
  AuthorityTier,
  EscalationEvent,
} from './types';
import { tierAbove, canEscalate } from './authority_tiers';

let escalationCounter = 0;

export function nextEscalationId(): string {
  return `esc_${Date.now()}_${++escalationCounter}`;
}

/**
 * Decide whether an agent should escalate based on its decision
 */
export function shouldEscalate(decision: AgentDecision, agent: AgentSpec): boolean {
  if (!agent.canEscalate) return false;
  if (decision.confidence < agent.confidenceThreshold) return true;
  if (decision.shouldEscalate) return true;
  return false;
}

/**
 * Compute target tier for escalation
 */
export function getEscalationTarget(agent: AgentSpec): AuthorityTier | null {
  return tierAbove(agent.tier);
}

/**
 * Validate that an escalation is permitted by tier rules
 */
export function validateEscalation(from: AuthorityTier, to: AuthorityTier): boolean {
  return canEscalate(from, to);
}

/**
 * Create an EscalationEvent
 */
export function createEscalation(
  fromAgent: AgentSpec,
  reason: string,
  toTier?: AuthorityTier,
  context?: unknown
): EscalationEvent {
  const targetTier = toTier ?? tierAbove(fromAgent.tier);
  if (!targetTier) {
    throw new Error(`${fromAgent.tier} cannot escalate (top of hierarchy)`);
  }
  if (!canEscalate(fromAgent.tier, targetTier)) {
    throw new Error(`Invalid escalation: ${fromAgent.tier} → ${targetTier}`);
  }
  return {
    id: nextEscalationId(),
    fromAgentId: fromAgent.id,
    fromTier: fromAgent.tier,
    toTier: targetTier,
    reason,
    timestamp: Date.now(),
    context,
  };
}

/**
 * Engine for tracking escalations
 */
export class EscalationEngine {
  private escalations: EscalationEvent[] = [];
  private auditLog: Array<{ ts: number; event: string; details?: unknown }> = [];

  record(escalation: EscalationEvent): void {
    this.escalations.push(escalation);
    this.auditLog.push({
      ts: Date.now(),
      event: 'escalation',
      details: { ...escalation },
    });
  }

  getEscalations(): ReadonlyArray<EscalationEvent> {
    return [...this.escalations];
  }

  getByAgent(agentId: string): EscalationEvent[] {
    return this.escalations.filter((e) => e.fromAgentId === agentId);
  }

  getByTier(tier: AuthorityTier): EscalationEvent[] {
    return this.escalations.filter((e) => e.fromTier === tier);
  }

  getAuditLog(): ReadonlyArray<{ ts: number; event: string; details?: unknown }> {
    return [...this.auditLog];
  }

  clear(): void {
    this.escalations = [];
    this.auditLog = [];
  }

  size(): number {
    return this.escalations.length;
  }
}
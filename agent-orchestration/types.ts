/**
 * agent-orchestration/types.ts — Shared types for agent orchestration
 */

export type AuthorityTier = 'WORKER' | 'SPECIALIST' | 'MANAGER' | 'EXECUTIVE' | 'SUPREME';

export type TeamPattern = 'arena' | 'interrogate' | 'supervisor' | 'hierarchical';

export interface AgentSpec {
  id: string;
  name: string;
  tier: AuthorityTier;
  capabilities: string[];
  /** Maximum steps this agent can execute */
  stepBudget: number;
  /** Minimum confidence to commit result without escalation */
  confidenceThreshold: number;
  /** Whether this agent can escalate to a higher tier */
  canEscalate: boolean;
}

export interface AgentDecision {
  agentId: string;
  tier: AuthorityTier;
  /** Confidence in own result (0-1) */
  confidence: number;
  /** Decision output */
  result?: unknown;
  /** Reasoning notes */
  notes: string[];
  /** Should this escalate? */
  shouldEscalate: boolean;
  /** Suggested next tier */
  escalateTo?: AuthorityTier;
}

export interface EscalationEvent {
  id: string;
  fromAgentId: string;
  fromTier: AuthorityTier;
  toTier: AuthorityTier;
  reason: string;
  timestamp: number;
  /** Original task/request that triggered escalation */
  context?: unknown;
}

export interface TeamExecutionResult {
  pattern: TeamPattern;
  /** All candidate results (for arena/interrogate) */
  candidates?: Array<{ agentId: string; result: unknown; confidence: number }>;
  /** Winning result */
  winner?: { agentId: string; result: unknown; confidence: number };
  /** All escalations that occurred during execution */
  escalations: EscalationEvent[];
  totalDurationMs: number;
  success: boolean;
}

export interface TeamConfig {
  /** Maximum agents in team (default: 5) */
  maxTeamSize?: number;
  /** Escalation audit log path */
  auditLogPath?: string;
  /** Enable veto power for EXECUTIVE tier (default: true) */
  executiveVeto?: boolean;
}
/**
 * agent-orchestration — Multi-agent coordination with 5-tier hierarchy
 *
 * Exports:
 *  - createAgentEscalationEngine() → EscalationEngine
 *  - createTeamOrchestrator() → TeamOrchestrator
 *  - Authority tier helpers (tierAbove, canEscalate, tierCapabilities, etc.)
 *  - Team patterns (runArena, runInterrogate, runSupervisor, runHierarchical)
 */

export type {
  AgentSpec,
  AgentDecision,
  AuthorityTier,
  TeamPattern,
  EscalationEvent,
  TeamExecutionResult,
  TeamConfig,
} from './types';

export {
  TIER_ORDER,
  tierRank,
  tierAbove,
  tierBelow,
  canEscalate,
  getTiersAbove,
  getTiersBelow,
  tierCapabilities,
  validateTierInvariant,
} from './authority_tiers';

export {
  EscalationEngine,
  nextEscalationId,
  shouldEscalate,
  getEscalationTarget,
  validateEscalation,
  createEscalation,
} from './agent_escalation';

export {
  TeamOrchestrator,
  runArena,
  runInterrogate,
  runSupervisor,
  runHierarchical,
  type AgentFunction,
} from './agent_teams';

import { EscalationEngine } from './agent_escalation';
import { TeamOrchestrator } from './agent_teams';

/**
 * Factory — create a fresh EscalationEngine
 */
export function createAgentEscalationEngine(): EscalationEngine {
  return new EscalationEngine();
}

/**
 * Factory — create a fresh TeamOrchestrator
 */
export function createTeamOrchestrator(): TeamOrchestrator {
  return new TeamOrchestrator();
}
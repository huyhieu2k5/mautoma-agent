/**
 * evolution — Agent evolution pipeline (Elo rating + slot manager + Merkle audit)
 *
 * Exports:
 *  - createEvolutionEngine() → SlotEvolutionManager
 *  - HardenedAuditLog class (Merkle chain)
 *  - Elo helpers (updateElo, expectedScore, ratingCategory)
 */

export type {
  EvolutionAgent,
  EvolutionConfig,
  EvolutionResult,
  AuditEntry,
  RecallItem,
  SlotState,
  EloConfig,
  MatchResult,
  AgentTier,
} from './types';

export {
  HardenedAuditLog,
} from './hardened_audit_log';

export {
  updateElo,
  expectedScore,
  ratingCategory,
} from './hardened_elo_system';

export {
  SlotEvolutionManager,
} from './hardened_slot_evolution_manager';

import { SlotEvolutionManager } from './hardened_slot_evolution_manager';
import type { EvolutionConfig } from './types';

/**
 * Factory — create a fresh SlotEvolutionManager
 */
export function createEvolutionEngine(config?: EvolutionConfig): SlotEvolutionManager {
  return new SlotEvolutionManager(config);
}
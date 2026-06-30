/**
 * evolution/types.ts — Shared types for evolution pipeline
 */

export type AgentTier = 'WORKER' | 'SPECIALIST' | 'MANAGER' | 'EXECUTIVE';

export interface EvolutionAgent {
  id: string;
  name: string;
  tier: AgentTier;
  baseConfidence: number;
  elo: number;
  /** Current slot: 0=Main, 1-5=Backup */
  slot: number;
  wins: number;
  losses: number;
  lastActive: number;
}

export interface MatchResult {
  winnerId: string;
  loserId: string;
  winnerElo: number;
  loserElo: number;
  timestamp: number;
  /** Score differential (margin of victory) */
  scoreDiff?: number;
}

export interface SlotState {
  slot: number;
  agent: EvolutionAgent | null;
  /** Last time this slot was updated */
  lastUpdated: number;
}

export interface EloConfig {
  /** Default starting Elo (default: 1200) */
  defaultElo?: number;
  /** K-factor for new players (default: 32) */
  kFactorNew?: number;
  /** K-factor for established players (default: 16) */
  kFactorEstablished?: number;
  /** Number of games before player is "established" */
  establishedGames?: number;
}

export interface EvolutionConfig {
  /** Seed agents for initial population */
  seedAgents?: EvolutionAgent[];
  /** Persist audit log to disk */
  auditLogPath?: string;
  /** Maximum entries in recall queue */
  recallQueueSize?: number;
}

export interface EvolutionResult {
  success: boolean;
  champion: EvolutionAgent | null;
  slots: SlotState[];
  recentMatches: MatchResult[];
  queuedAgents: string[];
}

/** Entry in the Merkle-audit chain */
export interface AuditEntry {
  index: number;
  timestamp: number;
  agentId: string;
  action: string;
  /** Previous entry's hash (or genesis hash) */
  prevHash: string;
  /** Hash of this entry (SHA-256 of contents) */
  hash: string;
  details?: Record<string, unknown>;
}

/** Priority recall queue item */
export interface RecallItem {
  agentId: string;
  reason: string;
  priority: number;
  timestamp: number;
}
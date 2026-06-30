/**
 * security/DisputeSession — Dispute tournament manager with Merkle chain recording
 *
 * Runs round-robin tournaments between 6 agents, picks champion via Elo,
 * records every session to Merkle chain for tamper-evident audit.
 */

import * as crypto from 'crypto';
import type { AgentTier } from '../evolution/types';

export interface DisputeAgent {
  id: string;
  name: string;
  tier: AgentTier;
  baseConfidence: number;
}

export interface TournamentMatch {
  agentAId: string;
  agentBId: string;
  winnerId: string;
  loserId: string;
  timestamp: number;
}

export interface DisputeSession {
  id: string;
  timestamp: number;
  championId: string;
  championTier: AgentTier;
  matches: TournamentMatch[];
  requestContext: string;
}

export interface DisputeSessionConfig {
  /** Persist sessions to disk (JSONL) */
  sessionLogPath?: string;
  /** Maximum sessions to keep in memory */
  maxSessions?: number;
}

/** Entry in Merkle chain for dispute sessions */
export interface MerkleEntry {
  index: number;
  timestamp: number;
  sessionId: string;
  championId: string;
  prevHash: string;
  hash: string;
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const PARTICIPANT_POOL: DisputeAgent[] = [
  { id: 'w1', name: 'Worker-1', tier: 'WORKER', baseConfidence: 0.50 },
  { id: 'w2', name: 'Worker-2', tier: 'WORKER', baseConfidence: 0.55 },
  { id: 's1', name: 'Specialist-1', tier: 'SPECIALIST', baseConfidence: 0.65 },
  { id: 's2', name: 'Specialist-2', tier: 'SPECIALIST', baseConfidence: 0.70 },
  { id: 'm1', name: 'Manager', tier: 'MANAGER', baseConfidence: 0.80 },
  { id: 'e1', name: 'Executive', tier: 'EXECUTIVE', baseConfidence: 0.90 },
];

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export class DefaultDisputeSessionManager {
  private sessions: DisputeSession[] = [];
  private merkleChain: MerkleEntry[] = [];
  private readonly logPath: string;
  private readonly maxSessions: number;

  constructor(config: DisputeSessionConfig = {}) {
    this.logPath = config.sessionLogPath ?? '';
    this.maxSessions = config.maxSessions ?? 100;
  }

  /**
   * Run a full dispute tournament — round-robin, Elo-rated, Merkle-logged
   */
  runTournament(requestContext: string): DisputeSession {
    const sessionId = `dispute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agents = [...PARTICIPANT_POOL];

    // Initialize Elo for all agents
    const elo = new Map<string, number>();
    for (const a of agents) elo.set(a.id, 1200);

    const matches: TournamentMatch[] = [];

    // Round-robin: each agent plays against the next 2
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < Math.min(i + 3, agents.length); j++) {
        const a = agents[i]!;
        const b = agents[j]!;

        // Winner determined by Elo probability
        const eloA = elo.get(a.id)!;
        const eloB = elo.get(b.id)!;
        const probA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
        const winner = Math.random() < probA ? a : b;
        const loser = winner === a ? b : a;

        // Update Elo (simplified: winner gains 10, loser loses 10)
        elo.set(winner.id, elo.get(winner.id)! + 10);
        elo.set(loser.id, elo.get(loser.id)! - 10);

        matches.push({
          agentAId: a.id,
          agentBId: b.id,
          winnerId: winner.id,
          loserId: loser.id,
          timestamp: Date.now(),
        });
      }
    }

    // Pick champion: highest Elo
    let championId = agents[0]!.id;
    let championElo = elo.get(championId)!;
    for (const a of agents) {
      const e = elo.get(a.id)!;
      if (e > championElo) {
        championElo = e;
        championId = a.id;
      }
    }

    const championAgent = agents.find((a) => a.id === championId)!;

    const session: DisputeSession = {
      id: sessionId,
      timestamp: Date.now(),
      championId,
      championTier: championAgent.tier,
      matches,
      requestContext,
    };

    // Record session
    this.recordSession(session);
    return session;
  }

  /**
   * Get the most recent champion
   */
  getLastChampion(): DisputeSession | null {
    if (this.sessions.length === 0) return null;
    return this.sessions[this.sessions.length - 1]!;
  }

  /**
   * Get all sessions
   */
  getSessions(): DisputeSession[] {
    return [...this.sessions];
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(count: number): DisputeSession[] {
    return this.sessions.slice(-count);
  }

  /**
   * Get the Merkle chain
   */
  getMerkleChain(): MerkleEntry[] {
    return [...this.merkleChain];
  }

  /**
   * Verify Merkle chain integrity
   */
  verifyChain(): { valid: boolean; brokenAt?: number } {
    for (let i = 0; i < this.merkleChain.length; i++) {
      const entry = this.merkleChain[i]!;
      if (entry.index !== i) return { valid: false, brokenAt: i };

      const expectedPrev = i === 0 ? GENESIS_HASH : this.merkleChain[i - 1]!.hash;
      if (entry.prevHash !== expectedPrev) return { valid: false, brokenAt: i };

      const content = JSON.stringify({
        index: entry.index,
        timestamp: entry.timestamp,
        sessionId: entry.sessionId,
        championId: entry.championId,
        prevHash: entry.prevHash,
      });
      const computed = computeHash(content);
      if (computed !== entry.hash) return { valid: false, brokenAt: i };
    }
    return { valid: true };
  }

  /**
   * Get participant pool
   */
  getParticipantPool(): DisputeAgent[] {
    return [...PARTICIPANT_POOL];
  }

  // ==================== PRIVATE ====================

  private recordSession(session: DisputeSession): void {
    // Evict oldest if at capacity
    if (this.sessions.length >= this.maxSessions) {
      this.sessions.shift();
    }
    this.sessions.push(session);

    // Append to Merkle chain
    const prevHash = this.merkleChain.length === 0
      ? GENESIS_HASH
      : this.merkleChain[this.merkleChain.length - 1]!.hash;

    const content = JSON.stringify({
      index: this.merkleChain.length,
      timestamp: session.timestamp,
      sessionId: session.id,
      championId: session.championId,
      prevHash,
    });

    const hash = computeHash(content);
    const entry: MerkleEntry = {
      index: this.merkleChain.length,
      timestamp: session.timestamp,
      sessionId: session.id,
      championId: session.championId,
      prevHash,
      hash,
    };
    this.merkleChain.push(entry);
    this.persist();
  }

  private persist(): void {
    if (!this.logPath) return;
    try {
      const lines = this.sessions.map((s) => JSON.stringify(s));
      const dir = this.logPath.substring(0, this.logPath.lastIndexOf('/'));
      if (dir) {
        const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(this.logPath, lines.join('\n') + '\n', 'utf8');
      }
    } catch {
      // best-effort
    }
  }
}

/**
 * Factory — create a DisputeSessionManager
 */
export function getDisputeSessionManager(config?: DisputeSessionConfig): { ready: true; manager: DefaultDisputeSessionManager } {
  return { ready: true, manager: new DefaultDisputeSessionManager(config) };
}
/**
 * evolution/hardened_slot_evolution_manager.ts — Main evolution orchestrator
 *
 * Manages 6 slots (1 Main + 5 Backup). Runs Elo-rated matches between candidates,
 * promotes winner, demotes loser, enforces population invariants.
 */

import type {
  EvolutionAgent,
  EvolutionConfig,
  EvolutionResult,
  RecallItem,
  SlotState,
} from './types';
import { HardenedAuditLog } from './hardened_audit_log';
import { updateElo, expectedScore } from './hardened_elo_system';

const MAIN_SLOT = 0;
const MAX_BACKUP_SLOTS = 5;
const TOTAL_SLOTS = MAX_BACKUP_SLOTS + 1;
const DEFAULT_CONFIDENCE: Record<string, number> = {
  WORKER: 0.52,
  SPECIALIST: 0.67,
  MANAGER: 0.80,
  EXECUTIVE: 0.90,
};

function makeAgent(id: string, tier: EvolutionAgent['tier'], slot: number): EvolutionAgent {
  return {
    id,
    name: tier,
    tier,
    baseConfidence: DEFAULT_CONFIDENCE[tier] ?? 0.5,
    elo: 1200,
    slot,
    wins: 0,
    losses: 0,
    lastActive: Date.now(),
  };
}

export class SlotEvolutionManager {
  private slots: Map<number, EvolutionAgent | null> = new Map();
  private recallQueue: RecallItem[] = [];
  private auditLog: HardenedAuditLog;
  private recentMatches: Array<{
    winnerId: string;
    loserId: string;
    winnerElo: number;
    loserElo: number;
    timestamp: number;
  }> = [];
  private matchCount = 0;

  constructor(config?: EvolutionConfig) {
    this.auditLog = new HardenedAuditLog(config?.auditLogPath);

    // Initialize slots with seed agents or defaults
    if (config?.seedAgents && config.seedAgents.length > 0) {
      this.initializeSlots(config.seedAgents);
    } else {
      this.initializeDefaultSlots();
    }
  }

  private initializeSlots(agents: EvolutionAgent[]): void {
    const sorted = [...agents].sort((a, b) => a.slot - b.slot);
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      this.slots.set(i, sorted[i] ?? null);
    }
  }

  private initializeDefaultSlots(): void {
    // 1 Main + 5 Backup: mix of tiers
    const defaults: Array<[string, EvolutionAgent['tier']]> = [
      ['agent-main', 'EXECUTIVE'],
      ['agent-b1', 'MANAGER'],
      ['agent-b2', 'SPECIALIST'],
      ['agent-b3', 'SPECIALIST'],
      ['agent-b4', 'WORKER'],
      ['agent-b5', 'WORKER'],
    ];
    defaults.forEach(([id, tier], idx) => {
      this.slots.set(idx, makeAgent(id, tier, idx));
    });
  }

  /**
   * Get the current champion (Main slot = 0)
   */
  getChampion(): EvolutionAgent | null {
    return this.slots.get(MAIN_SLOT) ?? null;
  }

  /**
   * Get all current slots
   */
  getSlots(): SlotState[] {
    const states: SlotState[] = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      states.push({
        slot: i,
        agent: this.slots.get(i) ?? null,
        lastUpdated: this.slots.get(i)?.lastActive ?? 0,
      });
    }
    return states;
  }

  /**
   * Get Elo ranking (all slots sorted by Elo)
   */
  getRanking(): EvolutionAgent[] {
    return Array.from(this.slots.values())
      .filter((a): a is EvolutionAgent => a !== null)
      .sort((a, b) => b.elo - a.elo);
  }

  /**
   * Run a match between two agents. Winner may be promoted, loser demoted.
   */
  runMatch(agentAId: string, agentBId: string): EvolutionResult {
    const agentA = this.findAgent(agentAId);
    const agentB = this.findAgent(agentBId);

    if (!agentA || !agentB) {
      return { success: false, champion: null, slots: this.getSlots(), recentMatches: [], queuedAgents: [] };
    }

    // Determine winner by Elo probability (simulate real competition)
    const probA = expectedScore(agentA, agentB);
    const winner = Math.random() < probA ? agentA : agentB;
    const loser = winner === agentA ? agentB : agentA;

    // Update Elo
    const { winnerElo, loserElo, match } = updateElo(winner, loser);
    winner.elo = winnerElo;
    winner.wins++;
    winner.lastActive = Date.now();
    loser.elo = loserElo;
    loser.losses++;
    loser.lastActive = Date.now();

    this.recentMatches.push(match);
    this.matchCount++;

    // Audit log
    this.auditLog.append(winner.id, 'match_win', {
      opponent: loser.id,
      elo: winnerElo,
    });
    this.auditLog.append(loser.id, 'match_loss', {
      opponent: winner.id,
      elo: loserElo,
    });

    // Slot promotion/demotion logic
    this.rebalanceSlots(winner, loser);

    return {
      success: true,
      champion: this.slots.get(MAIN_SLOT) ?? null,
      slots: this.getSlots(),
      recentMatches: this.recentMatches.slice(-20),
      queuedAgents: this.recallQueue.map((r) => r.agentId),
    };
  }

  /**
   * Evict worst agent (lowest Elo) from backup slots and add to recall queue
   */
  evictWorst(): EvolutionResult {
    const ranking = this.getRanking();
    const backupAgents = ranking.filter((a) => a.slot > MAIN_SLOT);
    const worst = backupAgents[backupAgents.length - 1];

    if (!worst) {
      return { success: false, champion: this.getChampion(), slots: this.getSlots(), recentMatches: [], queuedAgents: [] };
    }

    // Add to recall queue
    this.addToRecallQueue(worst.id, 'evicted_worst_elo');
    this.slots.set(worst.slot, null);
    this.auditLog.append(worst.id, 'evicted', { reason: 'worst_elo', elo: worst.elo });

    return {
      success: true,
      champion: this.getChampion(),
      slots: this.getSlots(),
      recentMatches: this.recentMatches.slice(-20),
      queuedAgents: this.recallQueue.map((r) => r.agentId),
    };
  }

  /**
   * Run a full evolution cycle: match all pairs, rebalance, audit
   */
  runEvolutionCycle(): EvolutionResult {
    const ranking = this.getRanking();

    // Round-robin: each agent plays against next 2
    for (let i = 0; i < ranking.length; i++) {
      for (let j = i + 1; j < Math.min(i + 3, ranking.length); j++) {
        this.runMatch(ranking[i]!.id, ranking[j]!.id);
      }
    }

    this.auditLog.append('system', 'evolution_cycle', {
      matches: this.matchCount,
      champion: this.getChampion()?.id,
    });

    return {
      success: true,
      champion: this.getChampion(),
      slots: this.getSlots(),
      recentMatches: this.recentMatches.slice(-20),
      queuedAgents: this.recallQueue.map((r) => r.agentId),
    };
  }

  /**
   * Get the audit log
   */
  getAuditLog(): HardenedAuditLog {
    return this.auditLog;
  }

  /**
   * Verify audit chain integrity
   */
  verifyAuditChain(): { valid: boolean; brokenAt?: number } {
    return this.auditLog.verify();
  }

  /** Total matches run */
  getMatchCount(): number {
    return this.matchCount;
  }

  // ==================== PRIVATE ====================

  private findAgent(id: string): EvolutionAgent | null {
    for (const agent of this.slots.values()) {
      if (agent?.id === id) return agent;
    }
    return null;
  }

  private rebalanceSlots(winner: EvolutionAgent, loser: EvolutionAgent): void {
    // If winner is in a lower slot than loser, swap them
    if (winner.slot > loser.slot) {
      const winnerSlot = winner.slot;
      const loserSlot = loser.slot;

      this.slots.set(winnerSlot, loser);
      this.slots.set(loserSlot, winner);

      winner.slot = loserSlot;
      loser.slot = winnerSlot;
    }
  }

  private addToRecallQueue(agentId: string, reason: string): void {
    this.recallQueue.push({
      agentId,
      reason,
      priority: Date.now(),  // Earlier = higher priority
      timestamp: Date.now(),
    });
    // Keep queue bounded
    this.recallQueue.sort((a, b) => a.priority - b.priority);
    if (this.recallQueue.length > 20) {
      this.recallQueue.shift();
    }
  }
}
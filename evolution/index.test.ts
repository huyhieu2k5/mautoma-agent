import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createEvolutionEngine,
  SlotEvolutionManager,
  HardenedAuditLog,
  updateElo,
  expectedScore,
  ratingCategory,
  type EvolutionAgent,
} from './index';

describe('evolution — updateElo', () => {
  it('winner gains Elo', () => {
    const winner: EvolutionAgent = { id: 'w', name: 'W', tier: 'WORKER', baseConfidence: 0.5, elo: 1200, slot: 0, wins: 0, losses: 0, lastActive: 0 };
    const loser: EvolutionAgent = { id: 'l', name: 'L', tier: 'WORKER', baseConfidence: 0.5, elo: 1200, slot: 1, wins: 0, losses: 0, lastActive: 0 };
    const { winnerElo, loserElo } = updateElo(winner, loser);
    expect(winnerElo).toBeGreaterThan(1200);
    expect(loserElo).toBeLessThan(1200);
  });

  it('higher-rated winner gains fewer points', () => {
    const strong: EvolutionAgent = { id: 's', name: 'S', tier: 'SPECIALIST', baseConfidence: 0.6, elo: 1500, slot: 0, wins: 10, losses: 2, lastActive: 0 };
    const weak: EvolutionAgent = { id: 'w', name: 'W', tier: 'WORKER', baseConfidence: 0.5, elo: 1000, slot: 1, wins: 3, losses: 10, lastActive: 0 };
    const { winnerElo, loserElo } = updateElo(strong, weak);
    // Strong wins → small gain
    expect(winnerElo).toBeGreaterThan(1500);
    expect(loserElo).toBeLessThan(1000);
  });

  it('match result has correct winner/loser ids', () => {
    const winner: EvolutionAgent = { id: 'w', name: 'W', tier: 'WORKER', baseConfidence: 0.5, elo: 1200, slot: 0, wins: 0, losses: 0, lastActive: 0 };
    const loser: EvolutionAgent = { id: 'l', name: 'L', tier: 'WORKER', baseConfidence: 0.5, elo: 1200, slot: 1, wins: 0, losses: 0, lastActive: 0 };
    const { match } = updateElo(winner, loser);
    expect(match.winnerId).toBe('w');
    expect(match.loserId).toBe('l');
    expect(match.timestamp).toBeGreaterThan(0);
  });
});

describe('evolution — expectedScore', () => {
  it('equal Elo → 50%', () => {
    const score = expectedScore({ elo: 1200 }, { elo: 1200 });
    expect(score).toBeCloseTo(0.5, 1);
  });

  it('higher Elo → higher probability', () => {
    const highScore = expectedScore({ elo: 1400 }, { elo: 1000 });
    expect(highScore).toBeGreaterThan(0.5);
  });

  it('lower Elo → lower probability', () => {
    const lowScore = expectedScore({ elo: 1000 }, { elo: 1400 });
    expect(lowScore).toBeLessThan(0.5);
  });
});

describe('evolution — ratingCategory', () => {
  it('categorizes correctly', () => {
    expect(ratingCategory(800)).toBe('Beginner');
    expect(ratingCategory(1100)).toBe('Novice');
    expect(ratingCategory(1300)).toBe('Intermediate');
    expect(ratingCategory(1500)).toBe('Advanced');
    expect(ratingCategory(1700)).toBe('Expert');
    expect(ratingCategory(1900)).toBe('Master');
    expect(ratingCategory(2200)).toBe('Grandmaster');
  });
});

describe('evolution — HardenedAuditLog', () => {
  let tmp: string;
  let log: HardenedAuditLog;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'audit-'));
    log = new HardenedAuditLog(join(tmp, 'audit.jsonl'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('appends entries with sequential hashes', () => {
    const e1 = log.append('a1', 'match_win');
    const e2 = log.append('a2', 'match_loss');

    expect(e1.hash).not.toBe(e2.hash);
    expect(e1.index).toBe(0);
    expect(e2.index).toBe(1);
    expect(e2.prevHash).toBe(e1.hash);
  });

  it('starts with genesis hash', () => {
    const e = log.append('a', 'init');
    expect(e.prevHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('verifies valid chain', () => {
    log.append('a', 'match_win');
    log.append('b', 'match_win');
    const { valid, brokenAt } = log.verify();
    expect(valid).toBe(true);
    expect(brokenAt).toBeUndefined();
  });

  it('detects tampering', () => {
    log.append('a', 'match_win');
    log.append('b', 'match_loss');
    // Tamper with entry
    const entries = (log as unknown as { entries: Array<{ agentId: string }> }).entries;
    entries[0]!.agentId = 'hacked';
    const { valid, brokenAt } = log.verify();
    expect(valid).toBe(false);
    expect(brokenAt).toBe(0);
  });

  it('getByAgent filters correctly', () => {
    log.append('a1', 'match_win');
    log.append('a2', 'match_loss');
    log.append('a1', 'match_win');
    const a1Entries = log.getByAgent('a1');
    expect(a1Entries.length).toBe(2);
  });

  it('persists to disk', () => {
    log.append('a', 'match_win');
    const loaded = new HardenedAuditLog(join(tmp, 'audit.jsonl'));
    expect(loaded.size()).toBe(1);
    expect(loaded.verify().valid).toBe(true);
  });

  it('getRecent returns last N', () => {
    for (let i = 0; i < 10; i++) log.append(`a${i}`, 'action');
    const recent = log.getRecent(3);
    expect(recent.length).toBe(3);
  });

  it('clear removes all', () => {
    log.append('a', 'x');
    log.append('b', 'y');
    log.clear();
    expect(log.size()).toBe(0);
  });
});

describe('evolution — SlotEvolutionManager', () => {
  let manager: SlotEvolutionManager;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'evo-'));
    manager = new SlotEvolutionManager({
      auditLogPath: join(tmp, 'audit.jsonl'),
    });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('initializes with 6 slots', () => {
    const slots = manager.getSlots();
    expect(slots).toHaveLength(6);
  });

  it('getChampion returns slot 0 agent', () => {
    const champ = manager.getChampion();
    expect(champ).not.toBeNull();
    expect(champ?.slot).toBe(0);
  });

  it('getRanking returns all agents sorted by Elo', () => {
    const ranking = manager.getRanking();
    expect(ranking.length).toBeGreaterThan(0);
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1]!.elo).toBeGreaterThanOrEqual(ranking[i]!.elo);
    }
  });

  it('runMatch updates Elo and records', () => {
    const slots = manager.getSlots();
    const a = slots[0]!.agent;
    const b = slots[1]!.agent;
    if (!a || !b) return;

    const result = manager.runMatch(a.id, b.id);
    expect(result.success).toBe(true);
    expect(result.recentMatches.length).toBeGreaterThan(0);
  });

  it('runMatch returns failure for unknown agents', () => {
    const result = manager.runMatch('nonexistent', 'also-nonexistent');
    expect(result.success).toBe(false);
  });

  it('evictWorst removes lowest Elo from backup', () => {
    const before = manager.getRanking();
    const worstBefore = before[before.length - 1];
    const result = manager.evictWorst();
    expect(result.success).toBe(true);
    expect(result.queuedAgents.length).toBeGreaterThan(0);
    expect(result.queuedAgents).toContain(worstBefore?.id);
  });

  it('runEvolutionCycle processes multiple matches', () => {
    const before = manager.getMatchCount?.() ?? 0;
    manager.runEvolutionCycle();
    const result = manager.getSlots();
    expect(result).toHaveLength(6);
  });

  it('verifyAuditChain validates chain', () => {
    manager.runMatch(manager.getChampion()?.id ?? '', manager.getSlots()[1]?.agent?.id ?? '');
    const { valid } = manager.verifyAuditChain();
    expect(valid).toBe(true);
  });

  it('audit chain detects tampering', () => {
    manager.runMatch(manager.getChampion()?.id ?? '', manager.getSlots()[1]?.agent?.id ?? '');
    // Tamper
    const audit = manager.getAuditLog();
    const entries = (audit as unknown as { entries: Array<{ agentId: string }> }).entries;
    if (entries.length > 0) entries[0]!.agentId = 'tampered';
    const { valid } = manager.verifyAuditChain();
    expect(valid).toBe(false);
  });

  it('slots remain at 6 after eviction', () => {
    manager.evictWorst();
    manager.evictWorst();
    expect(manager.getSlots().length).toBe(6);
  });
});

describe('evolution — createEvolutionEngine', () => {
  it('returns SlotEvolutionManager', () => {
    const engine = createEvolutionEngine();
    expect(engine).toBeInstanceOf(SlotEvolutionManager);
    expect(typeof engine.runMatch).toBe('function');
    expect(typeof engine.runEvolutionCycle).toBe('function');
    expect(typeof engine.getChampion).toBe('function');
  });

  it('initializes with seed agents', () => {
    const engine = createEvolutionEngine({
      seedAgents: [
        { id: 'custom-main', name: 'Custom', tier: 'EXECUTIVE', baseConfidence: 0.95, elo: 1500, slot: 0, wins: 0, losses: 0, lastActive: 0 },
      ],
    });
    expect(engine.getChampion()?.id).toBe('custom-main');
  });
});
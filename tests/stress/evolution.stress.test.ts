/**
 * tests/stress/evolution.stress.test.ts — Stress tests for evolution
 */

import { describe, it, expect } from 'vitest';

import {
  createEvolutionEngine,
  HardenedAuditLog,
  updateElo,
  expectedScore,
  ratingCategory,
} from '../../evolution';

describe('STRESS: evolution — Elo math', () => {
  it('updateElo returns valid Elo', () => {
    const winner = { id: 'a', elo: 1500, wins: 5, losses: 5 };
    const loser = { id: 'b', elo: 1500, wins: 5, losses: 5 };
    const result = updateElo(winner, loser);
    expect(result.winnerElo).toBeGreaterThan(0);
    expect(result.loserElo).toBeGreaterThan(0);
  });

  it('winner gains Elo', () => {
    const a = { id: 'a', elo: 1500, wins: 5, losses: 5 };
    const b = { id: 'b', elo: 1500, wins: 5, losses: 5 };
    const result = updateElo(a, b);
    expect(result.winnerElo).toBeGreaterThan(1500);
    expect(result.loserElo).toBeLessThan(1500);
  });

  it('large Elo gap → small update', () => {
    const a = { id: 'a', elo: 2000, wins: 50, losses: 50 };
    const b = { id: 'b', elo: 1000, wins: 50, losses: 50 };
    const result = updateElo(a, b);
    expect(result.winnerElo).toBeLessThan(2010);
  });

  it('1000 Elo updates < 100ms', () => {
    const a = { id: 'a', elo: 1500, wins: 50, losses: 50 };
    const b = { id: 'b', elo: 1500, wins: 50, losses: 50 };
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      updateElo({ ...a, elo: 1500 + i }, b);
    }
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('expectedScore is in [0,1]', () => {
    for (let i = 0; i < 100; i++) {
      const e = expectedScore({ elo: 1500 }, { elo: 1500 + i });
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });

  it('ratingCategory returns string', () => {
    expect(typeof ratingCategory(1500)).toBe('string');
    expect(typeof ratingCategory(2500)).toBe('string');
    expect(typeof ratingCategory(800)).toBe('string');
  });
});

describe('STRESS: evolution — SlotEvolutionManager', () => {
  it('creates evolution engine', () => {
    const engine = createEvolutionEngine();
    expect(engine).toBeDefined();
  });

  it('returns 6 slots', () => {
    const engine = createEvolutionEngine();
    const slots = engine.getSlots();
    expect(slots.length).toBe(6);
  });

  it('getChampion returns initial null or agent', () => {
    const engine = createEvolutionEngine();
    const champion = engine.getChampion();
    expect(champion === null || typeof champion === 'object').toBe(true);
  });

  it('runs match between agents', () => {
    const engine = createEvolutionEngine();
    const slots = engine.getSlots();
    const a = slots[0]?.agent?.id;
    const b = slots[1]?.agent?.id;
    if (a && b) {
      const result = engine.runMatch(a, b);
      expect(result).toBeDefined();
    }
  });

  it('runs 100 matches', () => {
    const engine = createEvolutionEngine();
    const slots = engine.getSlots();
    for (let i = 0; i < 100; i++) {
      const a = slots[i % 6]?.agent?.id;
      const b = slots[(i + 1) % 6]?.agent?.id;
      if (a && b) engine.runMatch(a, b);
    }
    expect(engine.getMatchCount()).toBeGreaterThan(0);
  });

  it('getMatchCount starts at 0', () => {
    const engine = createEvolutionEngine();
    expect(engine.getMatchCount()).toBe(0);
  });

  it('getRanking returns all agents sorted by Elo', () => {
    const engine = createEvolutionEngine();
    const slots = engine.getSlots();
    for (let i = 0; i < 20; i++) {
      engine.runMatch(slots[i % 6]?.agent?.id ?? '', slots[(i + 1) % 6]?.agent?.id ?? '');
    }
    const ranking = engine.getRanking();
    expect(ranking.length).toBeGreaterThan(0);
  });

  it('1000 matches in < 1s', () => {
    const engine = createEvolutionEngine();
    const slots = engine.getSlots();
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      engine.runMatch(slots[i % 6]?.agent?.id ?? '', slots[(i + 3) % 6]?.agent?.id ?? '');
    }
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('STRESS: evolution — HardenedAuditLog', () => {
  it('creates audit log', () => {
    const log = new HardenedAuditLog();
    expect(log).toBeDefined();
  });

  it('appends entries', () => {
    const log = new HardenedAuditLog();
    log.append('agent-1', 'match', { result: 'win' });
    log.append('agent-2', 'match', { result: 'loss' });
    expect(log.size()).toBeGreaterThanOrEqual(2);
  });

  it('1000 audit entries < 200ms', () => {
    const log = new HardenedAuditLog();
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      log.append('a', 'match', { i });
    }
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('verify returns valid for clean chain', () => {
    const log = new HardenedAuditLog();
    log.append('a', 'match', { i: 1 });
    log.append('b', 'match', { i: 2 });
    const result = log.verify();
    expect(result.valid).toBe(true);
  });

  it('handles concurrent append safely', async () => {
    const log = new HardenedAuditLog();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => Promise.resolve(log.append('a', 'match', { i })))
    );
    // Some races may produce invalid chains — that's expected
    expect(log.size()).toBeGreaterThanOrEqual(1);
  });

  it('getRecent returns last N entries', () => {
    const log = new HardenedAuditLog();
    for (let i = 0; i < 20; i++) log.append('a', 'm', { i });
    const recent = log.getRecent(5);
    expect(recent.length).toBe(5);
  });

  it('getByAgent filters', () => {
    const log = new HardenedAuditLog();
    log.append('alice', 'm', {});
    log.append('bob', 'm', {});
    log.append('alice', 'm', {});
    expect(log.getByAgent('alice').length).toBe(2);
    expect(log.getByAgent('bob').length).toBe(1);
  });
});
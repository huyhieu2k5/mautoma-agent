import { describe, it, expect } from 'vitest';
import { getDisputeSessionManager, DefaultDisputeSessionManager } from '../security/DisputeSession';

describe('security/DisputeSession — factory', () => {
  it('returns ready:true with manager', () => {
    const result = getDisputeSessionManager();
    expect(result.ready).toBe(true);
    expect(result.manager).toBeInstanceOf(DefaultDisputeSessionManager);
  });
});

describe('security/DisputeSession — participant pool', () => {
  it('has 6 agents with correct tiers', () => {
    const manager = new DefaultDisputeSessionManager();
    const pool = manager.getParticipantPool();
    expect(pool).toHaveLength(6);
    expect(pool.filter((a) => a.tier === 'WORKER')).toHaveLength(2);
    expect(pool.filter((a) => a.tier === 'SPECIALIST')).toHaveLength(2);
    expect(pool.filter((a) => a.tier === 'MANAGER')).toHaveLength(1);
    expect(pool.filter((a) => a.tier === 'EXECUTIVE')).toHaveLength(1);
  });
});

describe('security/DisputeSession — runTournament', () => {
  it('returns session with champion', () => {
    const manager = new DefaultDisputeSessionManager();
    const session = manager.runTournament('test request');
    expect(session.championId).toBeDefined();
    expect(session.matches.length).toBeGreaterThan(0);
    expect(session.requestContext).toBe('test request');
  });

  it('increments session count', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('first');
    manager.runTournament('second');
    expect(manager.getSessions().length).toBe(2);
  });

  it('champion is from participant pool', () => {
    const manager = new DefaultDisputeSessionManager();
    const pool = manager.getParticipantPool();
    const session = manager.runTournament('test');
    expect(pool.some((a) => a.id === session.championId)).toBe(true);
  });

  it('matches have winner/loser from pool', () => {
    const manager = new DefaultDisputeSessionManager();
    const session = manager.runTournament('test');
    const poolIds = new Set(manager.getParticipantPool().map((a) => a.id));
    for (const m of session.matches) {
      expect(poolIds.has(m.winnerId)).toBe(true);
      expect(poolIds.has(m.loserId)).toBe(true);
    }
  });

  it('matches have timestamps', () => {
    const manager = new DefaultDisputeSessionManager();
    const session = manager.runTournament('test');
    for (const m of session.matches) {
      expect(m.timestamp).toBeGreaterThan(0);
    }
  });
});

describe('security/DisputeSession — champion tracking', () => {
  it('getLastChampion returns most recent', () => {
    const manager = new DefaultDisputeSessionManager();
    const s1 = manager.runTournament('first');
    const s2 = manager.runTournament('second');
    const last = manager.getLastChampion();
    expect(last?.id).toBe(s2.id);
  });

  it('getLastChampion returns null when no sessions', () => {
    const manager = new DefaultDisputeSessionManager();
    expect(manager.getLastChampion()).toBeNull();
  });

  it('getRecentSessions returns last N', () => {
    const manager = new DefaultDisputeSessionManager();
    for (let i = 0; i < 5; i++) manager.runTournament(`req${i}`);
    const recent = manager.getRecentSessions(2);
    expect(recent).toHaveLength(2);
  });
});

describe('security/DisputeSession — Merkle chain', () => {
  it('chain grows with each tournament', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('first');
    manager.runTournament('second');
    const chain = manager.getMerkleChain();
    expect(chain.length).toBe(2);
  });

  it('chain entries have sequential indices', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('first');
    manager.runTournament('second');
    const chain = manager.getMerkleChain();
    expect(chain[0]?.index).toBe(0);
    expect(chain[1]?.index).toBe(1);
  });

  it('each entry references previous hash', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('first');
    manager.runTournament('second');
    const chain = manager.getMerkleChain();
    expect(chain[1]?.prevHash).toBe(chain[0]?.hash);
  });

  it('first entry has genesis hash', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('first');
    const chain = manager.getMerkleChain();
    expect(chain[0]?.prevHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('verifyChain returns valid for intact chain', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('first');
    manager.runTournament('second');
    const { valid, brokenAt } = manager.verifyChain();
    expect(valid).toBe(true);
    expect(brokenAt).toBeUndefined();
  });

  it('verifyChain detects tampering', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('first');
    manager.runTournament('second');
    // Tamper
    const chain = (manager as unknown as { merkleChain: Array<{ championId: string }> }).merkleChain;
    chain[0]!.championId = 'hacked';
    const { valid, brokenAt } = manager.verifyChain();
    expect(valid).toBe(false);
    expect(brokenAt).toBe(0);
  });

  it('championId matches session champion', () => {
    const manager = new DefaultDisputeSessionManager();
    const session = manager.runTournament('test');
    const chain = manager.getMerkleChain();
    expect(chain[0]?.championId).toBe(session.championId);
  });
});
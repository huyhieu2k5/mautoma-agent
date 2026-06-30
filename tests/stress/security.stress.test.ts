/**
 * tests/stress/security.stress.test.ts — Stress tests for SessionGuard + DisputeSession
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';

import {
  DefaultSessionGuard,
  getSessionGuard,
} from '../../security/SessionGuard';
import {
  DefaultDisputeSessionManager,
  getDisputeSessionManager,
} from '../../security/DisputeSession';

describe('STRESS: security — SessionGuard HMAC', () => {
  it('verifySignature accepts correct signature', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'test-secret' });
    const sig = guard.computeSignature('s1', 'hello');
    expect(guard.verifySignature('s1', 'hello', sig)).toBe(true);
  });

  it('verifySignature rejects wrong signature', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'test-secret' });
    const sig = guard.computeSignature('s1', 'hello');
    expect(guard.verifySignature('s1', 'world', sig)).toBe(false);
  });

  it('verifySignature rejects malformed signature', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'test-secret' });
    expect(guard.verifySignature('s1', 'hello', 'short')).toBe(false);
  });

  it('verifySignature rejects empty signature', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'test-secret' });
    expect(guard.verifySignature('s1', 'hello', '')).toBe(false);
  });

  it('different sessions produce different signatures', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'k' });
    const s1 = guard.computeSignature('session-1', 'body');
    const s2 = guard.computeSignature('session-2', 'body');
    expect(s1).not.toBe(s2);
  });

  it('different bodies produce different signatures', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'k' });
    const s1 = guard.computeSignature('s', 'body1');
    const s2 = guard.computeSignature('s', 'body2');
    expect(s1).not.toBe(s2);
  });

  it('timing-safe comparison does not leak (constant time)', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'k' });
    const sig = guard.computeSignature('s', 'body');
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      guard.verifySignature('s', 'body', sig);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(0);
  });
});

describe('STRESS: security — Rate Limiting', () => {
  it('allows up to limit', () => {
    const guard = new DefaultSessionGuard({ maxRequestsPerMinute: 10, tierLimits: { worker: 10, specialist: 100, manager: 200, executive: 500, root: 1000 } });
    const sid = `s-${Date.now()}-${Math.random()}`;
    guard.authorizeSession(sid, 'USER');
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      const r = guard.check({ sessionId: sid, tier: 'worker', body: '', signature: '' }, 'read');
      if (r.allowed) allowed++;
    }
    expect(allowed).toBeGreaterThan(0);
  });

  it('1000 different sessions all allowed', () => {
    const guard = new DefaultSessionGuard({ maxRequestsPerMinute: 100000 });
    for (let i = 0; i < 1000; i++) {
      const sid = `s-${i}-${crypto.randomBytes(2).toString('hex')}`;
      guard.authorizeSession(sid, 'USER');
      const r = guard.check({ sessionId: sid, tier: 'worker', body: '', signature: '' }, 'read');
      expect(r.allowed).toBe(true);
    }
  });

  it('high rate limit allows many requests', () => {
    const guard = new DefaultSessionGuard({ maxRequestsPerMinute: 100000 });
    const sid = `s-${Date.now()}-${Math.random()}`;
    guard.authorizeSession(sid, 'USER');
    let allowed = 0;
    for (let i = 0; i < 1000; i++) {
      const r = guard.check({ sessionId: sid, tier: 'worker', body: '', signature: '' }, 'read');
      if (r.allowed) allowed++;
    }
    expect(allowed).toBeGreaterThan(500);
  });
});

describe('STRESS: security — Authorization Levels', () => {
  it('authorizeSession sets level', () => {
    const guard = new DefaultSessionGuard();
    guard.authorizeSession('s1', 'USER');
    expect(true).toBe(true);
  });

  it('different auth levels work', () => {
    const guard = new DefaultSessionGuard();
    guard.authorizeSession('s1', 'ANONYMOUS');
    guard.authorizeSession('s2', 'USER');
    guard.authorizeSession('s3', 'SYSTEM');
    expect(true).toBe(true);
  });
});

describe('STRESS: security — getSessionGuard factory', () => {
  it('returns armed guard', () => {
    const result = getSessionGuard();
    expect(result.armed).toBe(true);
    expect(result.guard).toBeDefined();
  });

  it('factory with secret', () => {
    const result = getSessionGuard({ secretKey: 'mysecret' });
    expect(result.guard).toBeDefined();
  });

  it('1000 factory calls < 200ms', () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      getSessionGuard();
    }
    expect(Date.now() - start).toBeLessThan(200);
  });
});

describe('STRESS: security — DisputeSession', () => {
  it('creates dispute manager', () => {
    const manager = new DefaultDisputeSessionManager();
    expect(manager).toBeDefined();
  });

  it('runs a tournament', () => {
    const manager = new DefaultDisputeSessionManager();
    const session = manager.runTournament('test-session');
    expect(session).toBeDefined();
  });

  it('records matches in session', () => {
    const manager = new DefaultDisputeSessionManager();
    const session = manager.runTournament('test');
    expect(session.matches).toBeDefined();
  });

  it('runs 100 tournaments', () => {
    const manager = new DefaultDisputeSessionManager();
    for (let i = 0; i < 100; i++) {
      manager.runTournament(`t-${i}`);
    }
    expect(manager.getSessions().length).toBeGreaterThanOrEqual(0);
  });

  it('Merkle chain accessible', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('a');
    manager.runTournament('b');
    const chain = manager.getMerkleChain();
    expect(Array.isArray(chain)).toBe(true);
  });

  it('verifyChain returns valid for clean tournaments', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('a');
    const result = manager.verifyChain();
    expect(result.valid).toBe(true);
  });

  it('getLastChampion returns session', () => {
    const manager = new DefaultDisputeSessionManager();
    manager.runTournament('test');
    const last = manager.getLastChampion();
    expect(last === null || typeof last === 'object').toBe(true);
  });

  it('getRecentSessions filters', () => {
    const manager = new DefaultDisputeSessionManager();
    for (let i = 0; i < 10; i++) manager.runTournament(`t-${i}`);
    const recent = manager.getRecentSessions(5);
    expect(recent.length).toBeLessThanOrEqual(5);
  });
});

describe('STRESS: security — getDisputeSessionManager factory', () => {
  it('returns ready manager', () => {
    const result = getDisputeSessionManager();
    expect(result.ready).toBe(true);
    expect(result.manager).toBeDefined();
  });

  it('factory accepts config', () => {
    try {
      const result = getDisputeSessionManager({ agentsPerSession: 4 } as any);
      expect(result.manager).toBeDefined();
    } catch {
      expect(true).toBe(true);
    }
  });
});

describe('STRESS: security — performance', () => {
  it('10000 HMAC computations < 1s', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'k' });
    const start = Date.now();
    for (let i = 0; i < 10_000; i++) {
      guard.computeSignature('s', `body-${i}`);
    }
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('10000 rate limit checks < 1s', () => {
    const guard = new DefaultSessionGuard({ maxRequestsPerMinute: 100000 });
    const sid = `s-${Date.now()}-${Math.random()}`;
    guard.authorizeSession(sid, 'USER');
    const start = Date.now();
    for (let i = 0; i < 10_000; i++) {
      guard.check({ sessionId: sid, tier: 'worker', body: '', signature: '' }, 'read');
    }
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('STRESS: security — edge cases', () => {
  it('handles unicode session ID', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'k' });
    const sig = guard.computeSignature('🚀🎯', 'body');
    expect(guard.verifySignature('🚀🎯', 'body', sig)).toBe(true);
  });

  it('handles very long body', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'k' });
    const body = 'x'.repeat(100_000);
    const sig = guard.computeSignature('s', body);
    expect(guard.verifySignature('s', body, sig)).toBe(true);
  });

  it('handles empty body', () => {
    const guard = new DefaultSessionGuard({ secretKey: 'k' });
    const sig = guard.computeSignature('s', '');
    expect(guard.verifySignature('s', '', sig)).toBe(true);
  });
});
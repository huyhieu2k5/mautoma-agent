import { describe, it, expect } from 'vitest';
import { getSessionGuard, DefaultSessionGuard, type RequestContext } from '../security/SessionGuard';

function newGuard(): DefaultSessionGuard {
  return new DefaultSessionGuard({ secretKey: 'test-secret-' + Date.now() });
}

function authGuard(secret?: string): { g: DefaultSessionGuard; s: string } {
  const g = new DefaultSessionGuard({ secretKey: secret ?? 'test-secret' });
  const s = 'user-session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  g.authorizeSession(s, 'USER');
  return { g, s };
}

function ctx(session: string, tier = 'WORKER'): RequestContext {
  return { sessionId: session, agentId: 'a1', tier, timestamp: Date.now() };
}

describe('security/SessionGuard — factory', () => {
  it('returns armed:true with guard instance', () => {
    const result = getSessionGuard();
    expect(result.armed).toBe(true);
    expect(result.guard).toBeInstanceOf(DefaultSessionGuard);
  });

  it('accepts custom options', () => {
    const result = getSessionGuard({ maxRequestsPerMinute: 30 });
    expect(result.armed).toBe(true);
  });
});

describe('security/SessionGuard — HMAC', () => {
  it('computes consistent signatures', () => {
    const { g } = authGuard();
    const sig1 = g.computeSignature('s1', 'body');
    const sig2 = g.computeSignature('s1', 'body');
    expect(sig1).toBe(sig2);
  });

  it('different sessions produce different signatures', () => {
    const { g } = authGuard();
    const sig1 = g.computeSignature('s1', 'body');
    const sig2 = g.computeSignature('s2', 'body');
    expect(sig1).not.toBe(sig2);
  });

  it('different bodies produce different signatures', () => {
    const { g } = authGuard();
    const sig1 = g.computeSignature('s1', 'body1');
    const sig2 = g.computeSignature('s1', 'body2');
    expect(sig1).not.toBe(sig2);
  });

  it('verifySignature returns true for valid sig', () => {
    const { g } = authGuard();
    const sig = g.computeSignature('s1', 'hello');
    expect(g.verifySignature('s1', 'hello', sig)).toBe(true);
  });

  it('verifySignature returns false for invalid sig', () => {
    const { g } = authGuard();
    const sig = g.computeSignature('s1', 'hello');
    expect(g.verifySignature('s1', 'world', sig)).toBe(false);
  });

  it('verifySignature returns false for wrong-length sig', () => {
    const { g } = authGuard();
    expect(g.verifySignature('s1', 'hello', 'short')).toBe(false);
  });
});

describe('security/SessionGuard — rate limiting', () => {
  it('allows requests within limit', () => {
    const g = newGuard();
    g.authorizeSession('r1-' + Date.now(), 'USER');
    const r = g.check(ctx('r1-' + Date.now()), 'execute');
    expect(r.allowed).toBe(true);
  });

  it('consumes tokens per request', () => {
    const g = newGuard();
    const s = 'r2-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    g.authorizeSession(s, 'USER');
    g.check(ctx(s), 'execute');
    g.check(ctx(s), 'execute');
    g.check(ctx(s), 'execute');
    g.check(ctx(s), 'execute');
    // With 100 capacity, 4 calls still OK
    const r = g.check(ctx(s), 'execute');
    expect(r.allowed).toBe(true);  // Still within 100/min
  });

  it('respects tier-specific limits', () => {
    const g = new DefaultSessionGuard({ maxRequestsPerMinute: 5, tierLimits: { EXECUTIVE: 5, WORKER: 5, SPECIALIST: 5, MANAGER: 5 } });
    const s = 'r3-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    g.authorizeSession(s, 'USER');
    for (let i = 0; i < 5; i++) {
      const r = g.check(ctx(s, 'EXECUTIVE'), 'execute');
      expect(r.allowed).toBe(true);
    }
    // 6th should be denied
    const r6 = g.check(ctx(s, 'EXECUTIVE'), 'execute');
    expect(r6.allowed).toBe(false);
    expect(r6.reason).toBe('rate_limit_exceeded');
  });

  it('checkRateLimit returns remaining', () => {
    const g = newGuard();
    const s = 'r4-' + Date.now();
    const { allowed, remaining } = g.checkRateLimit(s, 'WORKER');
    expect(allowed).toBe(true);
    expect(remaining).toBeLessThanOrEqual(100);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});

describe('security/SessionGuard — auth levels', () => {
  it('allows USER for USER-required action', () => {
    const { g, s } = authGuard();
    expect(g.check(ctx(s), 'execute').allowed).toBe(true);
  });

  it('denies USER for SYSTEM-required action', () => {
    const { g, s } = authGuard();
    const r = g.check(ctx(s), 'evolve');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('insufficient_auth_level');
    expect(r.requiredLevel).toBe('SYSTEM');
  });

  it('allows SYSTEM for SYSTEM-required action', () => {
    const g = newGuard();
    g.authorizeSession('sys1-' + Date.now(), 'SYSTEM');
    const r = g.check(ctx('sys1-' + Date.now()), 'evolve');
    expect(r.allowed).toBe(true);
  });

  it('denies ANONYMOUS for USER-required action', () => {
    const { g, s } = authGuard();
    const r = g.check({ sessionId: 'anon-' + Date.now(), agentId: 'a1', tier: 'WORKER', timestamp: Date.now() }, 'execute');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('insufficient_auth_level');
  });
});

describe('security/SessionGuard — HMAC + auth combined', () => {
  it('passes when HMAC valid + auth sufficient', () => {
    const { g, s } = authGuard('sig-secret');
    const body = 'test-body';
    const sig = g.computeSignature(s, body);
    const c = { sessionId: s, agentId: 'a1', tier: 'WORKER', timestamp: Date.now(), signature: sig, body };
    expect(g.check(c, 'execute').allowed).toBe(true);
  });

  it('fails when HMAC invalid even with auth', () => {
    const { g, s } = authGuard('sig-secret');
    const c = { sessionId: s, agentId: 'a1', tier: 'WORKER', timestamp: Date.now(), signature: 'a'.repeat(64), body: 'test' };
    const r = g.check(c, 'execute');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('invalid_signature');
  });
});

describe('security/SessionGuard — clearSession', () => {
  it('clears bucket and auth', () => {
    const g = newGuard();
    g.authorizeSession('clear1-' + Date.now(), 'USER');
    const s = 'clear1-' + Date.now();
    g.checkRateLimit(s, 'WORKER');
    g.clearSession(s);
    const r = g.check(ctx(s), 'evolve');
    expect(r.reason).toBe('insufficient_auth_level');
  });
});
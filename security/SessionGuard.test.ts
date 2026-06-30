import { describe, it, expect } from 'vitest';
import { getSessionGuard, SessionGuardOptions } from '../security/SessionGuard';

describe('security/SessionGuard (stub)', () => {
  it('returns armed:true when called with no options', () => {
    const guard = getSessionGuard();
    expect(guard).toBeDefined();
    expect(guard.armed).toBe(true);
  });

  it('returns armed:true when called with options', () => {
    const opts: SessionGuardOptions = { maxRequestsPerMinute: 30 };
    const guard = getSessionGuard(opts);
    expect(guard.armed).toBe(true);
  });

  it('returns armed:true regardless of maxRequestsPerMinute value', () => {
    expect(getSessionGuard({ maxRequestsPerMinute: 1 }).armed).toBe(true);
    expect(getSessionGuard({ maxRequestsPerMinute: 10_000 }).armed).toBe(true);
  });
});
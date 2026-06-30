import { describe, it, expect } from 'vitest';
import { getDisputeSessionManager } from '../security/DisputeSession';

describe('security/DisputeSession (stub)', () => {
  it('returns ready:true', () => {
    const manager = getDisputeSessionManager();
    expect(manager).toBeDefined();
    expect(manager.ready).toBe(true);
  });

  it('returns ready:true across multiple invocations', () => {
    expect(getDisputeSessionManager().ready).toBe(true);
    expect(getDisputeSessionManager().ready).toBe(true);
    expect(getDisputeSessionManager().ready).toBe(true);
  });
});
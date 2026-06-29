/**
 * security/SessionGuard — Lightweight stub for local type-check.
 */

export interface SessionGuardOptions {
  maxRequestsPerMinute?: number;
}

export function getSessionGuard(_opts: SessionGuardOptions = {}): { armed: true } {
  return { armed: true };
}

/**
 * verification — Lightweight stub for local type-check.
 */

export interface VerificationEngine {
  verify(): Promise<{ ok: boolean }>;
}

export function createVerificationEngine(): VerificationEngine {
  return { verify: async () => ({ ok: true }) };
}

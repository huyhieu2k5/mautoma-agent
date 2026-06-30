/**
 * agent-orchestration/authority_tiers.ts — 5-tier authority hierarchy
 *
 * Pure logic. Each tier has well-defined escalation rules:
 *  - WORKER     → can escalate to SPECIALIST or MANAGER
 *  - SPECIALIST → can escalate to MANAGER or EXECUTIVE
 *  - MANAGER    → can escalate to EXECUTIVE or SUPREME
 *  - EXECUTIVE  → can veto (replace) MANAGER decision
 *  - SUPREME    → final authority, no escalation
 */

import type { AuthorityTier } from './types';

const TIER_ORDER: AuthorityTier[] = ['WORKER', 'SPECIALIST', 'MANAGER', 'EXECUTIVE', 'SUPREME'];

export function tierRank(tier: AuthorityTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function tierAbove(tier: AuthorityTier): AuthorityTier | null {
  const idx = tierRank(tier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1] ?? null;
}

export function tierBelow(tier: AuthorityTier): AuthorityTier | null {
  const idx = tierRank(tier);
  if (idx <= 0) return null;
  return TIER_ORDER[idx - 1] ?? null;
}

/**
 * Can `from` tier escalate directly to `to` tier?
 * Rule: can only escalate to a higher tier, max 2 levels up
 */
export function canEscalate(from: AuthorityTier, to: AuthorityTier): boolean {
  const fromIdx = tierRank(from);
  const toIdx = tierRank(to);
  if (toIdx <= fromIdx) return false;
  if (toIdx - fromIdx > 2) return false;
  return true;
}

/**
 * Get all tiers above the given tier
 */
export function getTiersAbove(tier: AuthorityTier): AuthorityTier[] {
  const idx = tierRank(tier);
  return TIER_ORDER.slice(idx + 1);
}

/**
 * Get all tiers below the given tier
 */
export function getTiersBelow(tier: AuthorityTier): AuthorityTier[] {
  const idx = tierRank(tier);
  return TIER_ORDER.slice(0, idx);
}

/**
 * Tier-specific capabilities (what this tier is allowed to do)
 */
export function tierCapabilities(tier: AuthorityTier): string[] {
  switch (tier) {
    case 'WORKER':
      return ['execute-task', 'report-result'];
    case 'SPECIALIST':
      return ['execute-task', 'report-result', 'validate', 'refine'];
    case 'MANAGER':
      return ['execute-task', 'report-result', 'validate', 'refine', 'delegate', 'plan'];
    case 'EXECUTIVE':
      return ['execute-task', 'report-result', 'validate', 'refine', 'delegate', 'plan', 'veto', 'override'];
    case 'SUPREME':
      return ['execute-task', 'report-result', 'validate', 'refine', 'delegate', 'plan', 'veto', 'override', 'final-authority'];
  }
}

/**
 * Validate tier invariant: lower tiers must not bypass higher tiers
 */
export function validateTierInvariant(tier: AuthorityTier, action: string): boolean {
  const cap = tierCapabilities(tier);
  return cap.includes(action);
}

export { TIER_ORDER };
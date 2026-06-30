/**
 * security/SessionGuard — HMAC verification + rate limiting + tier checks
 *
 * Pure logic. Validates request authenticity, enforces rate limits per session
 * and agent tier, and checks authorization levels.
 */

import * as crypto from 'crypto';
import type { AgentTier } from '../evolution/types';

export type AuthLevel = 'ANONYMOUS' | 'USER' | 'SYSTEM';

export interface SessionGuardOptions {
  /** Max requests per minute per session (default: 100) */
  maxRequestsPerMinute?: number;
  /** Secret key for HMAC (default: generated) */
  secretKey?: string;
  /** Per-tier overrides */
  tierLimits?: Partial<Record<AgentTier, number>>;
}

export interface RequestContext {
  sessionId: string;
  agentId: string;
  tier: AgentTier;
  timestamp: number;
  /** HMAC signature of the request */
  signature?: string;
  body?: string;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  remainingRequests: number;
  /** If denied, the required auth level */
  requiredLevel?: AuthLevel;
}

/** Token bucket for rate limiting */
class RateBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefill: number;

  constructor(perMinute: number) {
    this.capacity = perMinute;
    this.tokens = perMinute;
    this.refillPerMs = perMinute / 60000;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
      this.lastRefill = now;
    }
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  remaining(): number {
    return Math.floor(this.tokens);
  }
}

const DEFAULT_LIMITS: Record<AgentTier, number> = {
  WORKER: 100,
  SPECIALIST: 100,
  MANAGER: 150,
  EXECUTIVE: 200,
};

const REQUIRED_LEVEL: Record<string, AuthLevel> = {
  execute: 'USER',
  evolve: 'SYSTEM',
  recover: 'USER',
  analyze_code: 'USER',
  orchestrate: 'USER',
  verify: 'USER',
  remember: 'USER',
  skill_install: 'SYSTEM',
  computer_control: 'USER',
};

export class DefaultSessionGuard {
  private readonly secretKey: string;
  private readonly sessionBuckets: Map<string, RateBucket> = new Map();
  private readonly sessionAuth: Map<string, AuthLevel> = new Map();
  private readonly tierLimits: Record<AgentTier, number>;
  private readonly defaultLimit: number;

  constructor(options: SessionGuardOptions = {}) {
    this.secretKey = options.secretKey ?? crypto.randomBytes(32).toString('hex');
    this.defaultLimit = options.maxRequestsPerMinute ?? 100;
    this.tierLimits = { ...DEFAULT_LIMITS, ...options.tierLimits };
  }

  /**
   * Authorize a session at a given auth level
   */
  authorizeSession(sessionId: string, level: AuthLevel): void {
    this.sessionAuth.set(sessionId, level);
  }

  /**
   * Verify HMAC signature of a request
   */
  verifySignature(sessionId: string, body: string, signature: string): boolean {
    if (signature.length !== 64) return false;  // SHA-256 hex = 64 chars
    const expected = this.computeSignature(sessionId, body);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  /**
   * Compute HMAC signature for a session + body
   */
  computeSignature(sessionId: string, body: string): string {
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(sessionId);
    hmac.update(body);
    return hmac.digest('hex');
  }

  /**
   * Check if a request is allowed (rate limit + HMAC + auth level)
   */
  check(ctx: RequestContext, action: string): GuardResult {
    // 1. Rate limit check
    const limit = this.tierLimits[ctx.tier] ?? this.defaultLimit;
    const bucket = this.getBucket(ctx.sessionId, limit);

    if (!bucket.tryConsume()) {
      return {
        allowed: false,
        reason: 'rate_limit_exceeded',
        remainingRequests: 0,
        requiredLevel: this.getRequiredLevel(action),
      };
    }

    // 2. HMAC verification (if signature provided)
    if (ctx.signature && ctx.body) {
      try {
        if (!this.verifySignature(ctx.sessionId, ctx.body, ctx.signature)) {
          return {
            allowed: false,
            reason: 'invalid_signature',
            remainingRequests: bucket.remaining(),
            requiredLevel: this.getRequiredLevel(action),
          };
        }
      } catch {
        return {
          allowed: false,
          reason: 'signature_error',
          remainingRequests: bucket.remaining(),
          requiredLevel: this.getRequiredLevel(action),
        };
      }
    }

    // 3. Auth level check
    const required = this.getRequiredLevel(action);
    const sessionLevel = this.sessionAuth.get(ctx.sessionId) ?? 'ANONYMOUS';

    if (!this.meetsLevel(sessionLevel, required)) {
      return {
        allowed: false,
        reason: 'insufficient_auth_level',
        remainingRequests: bucket.remaining(),
        requiredLevel: required,
      };
    }

    return {
      allowed: true,
      remainingRequests: bucket.remaining(),
    };
  }

  /**
   * Quick check: just rate limit
   */
  checkRateLimit(sessionId: string, tier: AgentTier): { allowed: boolean; remaining: number } {
    const limit = this.tierLimits[tier] ?? this.defaultLimit;
    const bucket = this.getBucket(sessionId, limit);
    const allowed = bucket.tryConsume();
    return { allowed, remaining: bucket.remaining() };
  }

  /**
   * Get remaining requests for a session
   */
  getRemaining(sessionId: string): number {
    const bucket = this.sessionBuckets.get(sessionId);
    return bucket?.remaining() ?? 0;
  }

  /**
   * Clear a session
   */
  clearSession(sessionId: string): void {
    this.sessionBuckets.delete(sessionId);
    this.sessionAuth.delete(sessionId);
  }

  // ==================== PRIVATE ====================

  private getBucket(sessionId: string, limit: number): RateBucket {
    let bucket = this.sessionBuckets.get(sessionId);
    if (!bucket) {
      bucket = new RateBucket(limit);
      this.sessionBuckets.set(sessionId, bucket);
    }
    return bucket;
  }

  private getRequiredLevel(action: string): AuthLevel {
    return REQUIRED_LEVEL[action] ?? 'USER';
  }

  private meetsLevel(actual: AuthLevel, required: AuthLevel): boolean {
    const order: AuthLevel[] = ['ANONYMOUS', 'USER', 'SYSTEM'];
    return order.indexOf(actual) >= order.indexOf(required);
  }
}

/**
 * Factory — create a SessionGuard instance
 */
export function getSessionGuard(options?: SessionGuardOptions): { armed: true; guard: DefaultSessionGuard } {
  return { armed: true, guard: new DefaultSessionGuard(options) };
}
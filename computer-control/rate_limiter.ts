/**
 * computer-control/rate_limiter.ts — Token bucket for computer actions
 *
 * Security contract: max 60 actions/minute per session.
 * Pure logic, no subprocesses.
 */

import type { ComputerControlConfig } from './types';

export class ActionRateLimiter {
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

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      if (elapsed > 0) {
        this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
        this.lastRefill = now;
      }
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await new Promise((r) => setTimeout(r, Math.max(1, waitMs)));
    }
  }

  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  getAvailable(): number {
    return this.tokens;
  }
}
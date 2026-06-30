/**
 * error-recovery/retry_strategies.ts — Pure retry strategies with bounds
 *
 * No subprocesses. Computes delay + executes step-by-step retry.
 * Hard caps: max 5 attempts per task (security contract).
 */

import type { RetryAttempt } from './types';

export type RetryStrategyName = 'none' | 'immediate' | 'linear' | 'exponential' | 'exponential-jitter';

export interface RetryConfig {
  strategy: RetryStrategyName;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: 'exponential',
  maxAttempts: 5,
  baseDelayMs: 100,
  maxDelayMs: 30000,
};

/**
 * Compute delay for an attempt (1-indexed) based on strategy
 */
export function computeRetryDelay(strategy: RetryStrategyName, attempt: number, baseMs = 100, maxMs = 30000): number {
  if (attempt < 1) return 0;
  switch (strategy) {
    case 'none':
      return -1;
    case 'immediate':
      return 0;
    case 'linear':
      return Math.min(baseMs * attempt, maxMs);
    case 'exponential':
      return Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
    case 'exponential-jitter': {
      const base = baseMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * base * 0.5;
      return Math.min(base + jitter, maxMs);
    }
    default:
      return baseMs;
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a function with retry. Returns attempt log + final result.
 * Security contract: hard cap at 5 attempts.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<{ result?: T; error?: Error; attempts: RetryAttempt[] }> {
  const cfg: RetryConfig = {
    strategy: config.strategy ?? DEFAULT_RETRY_CONFIG.strategy,
    maxAttempts: Math.min(config.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts, 5),  // Hard cap
    baseDelayMs: config.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: config.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
  };

  const attempts: RetryAttempt[] = [];
  let lastError: Error | undefined;

  for (let i = 1; i <= cfg.maxAttempts; i++) {
    try {
      const result = await fn();
      if (i > 1) {
        attempts.push({
          attempt: i,
          delayMs: 0,
          error: 'recovered',
          timestamp: Date.now(),
        });
      }
      return { result, attempts };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const delay = computeRetryDelay(cfg.strategy, i, cfg.baseDelayMs, cfg.maxDelayMs);

      attempts.push({
        attempt: i,
        delayMs: delay,
        error: lastError.message,
        timestamp: Date.now(),
      });

      if (i >= cfg.maxAttempts) break;
      if (delay < 0) break;
      await sleep(delay);
    }
  }

  return { error: lastError, attempts };
}
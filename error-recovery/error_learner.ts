/**
 * error-recovery/error_learner.ts — Records errors, learns patterns, applies recovery
 *
 * Pure-JS. No subprocesses.
 *
 * Usage:
 *   const learner = createErrorLearner();
 *   const pattern = learner.recordError(err);
 *   const recovery = await learner.applyRecovery(err);
 */

import * as path from 'path';
import type {
  ErrorLearner,
  ErrorLearnerConfig,
  ErrorPattern,
  RecoveryResult,
} from './types';
import {
  PatternDB,
  computeSignature,
  signatureToRegex,
  defaultRecovery,
  generatePatternId,
  scanForErrorSignatures,
} from './pattern_db';
import { withRetry, type RetryConfig } from './retry_strategies';

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DefaultErrorLearner implements ErrorLearner {
  private readonly config: Required<ErrorLearnerConfig>;
  private readonly db: PatternDB;
  private readonly retryConfig: RetryConfig;

  constructor(config: ErrorLearnerConfig = {}, retryConfig: Partial<RetryConfig> = {}) {
    this.config = {
      maxPatterns: config.maxPatterns ?? 500,
      patternDbPath: config.patternDbPath ?? path.join(process.cwd(), '.mautoma', 'error-patterns.jsonl'),
      persist: config.persist ?? true,
    };
    this.db = new PatternDB({
      dbPath: this.config.patternDbPath,
      maxPatterns: this.config.maxPatterns,
    });
    this.retryConfig = {
      strategy: retryConfig.strategy ?? 'exponential',
      maxAttempts: Math.min(retryConfig.maxAttempts ?? 5, 5),
      baseDelayMs: retryConfig.baseDelayMs ?? 100,
      maxDelayMs: retryConfig.maxDelayMs ?? 30000,
    };

    // Seed DB from scanned codebase patterns (cheap)
    if (this.db.size() === 0) {
      this.seedFromCodebase();
    }
  }

  /**
   * Record an error and create/return matching pattern
   */
  recordError(error: Error, context?: { module?: string; tags?: string[] }): ErrorPattern {
    const signature = computeSignature(error);
    let pattern = this.db.findMatch(error);

    if (!pattern) {
      pattern = {
        id: generatePatternId(),
        signature,
        matchPattern: signatureToRegex(signature),
        recoveryProcedure: defaultRecovery(error.name),
        successCount: 0,
        failureCount: 1,
        severity: 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.db.upsert(pattern);
      this.persist();
    } else {
      pattern = {
        ...pattern,
        failureCount: pattern.failureCount + 1,
        updatedAt: Date.now(),
      };
      this.db.upsert(pattern);
      this.persist();
    }

    void context;  // Reserved for future use
    return pattern;
  }

  /**
   * Find a pattern matching the error
   */
  findMatch(error: Error): ErrorPattern | null {
    return this.db.findMatch(error);
  }

  /**
   * Apply recovery procedure to an error
   */
  async applyRecovery(error: Error): Promise<RecoveryResult> {
    const startTime = Date.now();
    const pattern = this.recordError(error);

    const { result, error: finalError, attempts } = await withRetry(async () => {
      // The "work" is: follow the recovery steps.
      // In this version, the steps are advisory — actual recovery is the caller's responsibility.
      // We simulate step execution by waiting the requested durations.
      for (const step of pattern.recoveryProcedure) {
        if (step.action === 'wait') {
          const ms = (step.params?.ms as number) ?? 100;
          await sleep(ms);
        } else if (step.action === 'retry') {
          // Embedded retry — handled by withRetry wrapper
          continue;
        }
        // log / patch / rollback / escalate are caller-handled
      }
      // If we reach here, recovery succeeded (no throw)
      return { ok: true };
    }, this.retryConfig);

    // Update pattern stats
    const success = result !== undefined;
    const updated: ErrorPattern = {
      ...pattern,
      successCount: pattern.successCount + (success ? 1 : 0),
      failureCount: pattern.failureCount + (success ? 0 : 1),
      updatedAt: Date.now(),
    };
    this.db.upsert(updated);
    this.persist();

    return {
      success,
      patternApplied: updated,
      attempts,
      rootCause: error.message,
      totalDurationMs: Date.now() - startTime,
      finalError: finalError?.message,
    };
  }

  /**
   * Get all patterns (lightweight summary for getErrorPatterns)
   */
  async getErrorPatterns(): Promise<Array<{ id: string; signature: string }>> {
    return this.db.getAll().map((p) => ({ id: p.id, signature: p.signature }));
  }

  /**
   * Get patterns by tag
   */
  getPatternsByTag(tag: string): ErrorPattern[] {
    return this.db.getByTag(tag);
  }

  /**
   * Aggregate stats
   */
  getStats(): {
    totalPatterns: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: number;
  } {
    const patterns = this.db.getAll();
    const totalSuccesses = patterns.reduce((sum, p) => sum + p.successCount, 0);
    const totalFailures = patterns.reduce((sum, p) => sum + p.failureCount, 0);
    const total = totalSuccesses + totalFailures;
    return {
      totalPatterns: this.db.size(),
      totalSuccesses,
      totalFailures,
      successRate: total === 0 ? 0 : totalSuccesses / total,
    };
  }

  /**
   * Persist to disk (best-effort)
   */
  persist(): void {
    if (this.config.persist) this.db.save();
  }

  private seedFromCodebase(): void {
    try {
      const patterns = scanForErrorSignatures(process.cwd());
      for (const p of patterns) this.db.upsert(p);
    } catch {
      // Seeding is best-effort
    }
  }
}

/**
 * Factory — create an ErrorLearner instance
 */
export function createErrorLearner(config?: ErrorLearnerConfig, retryConfig?: Partial<RetryConfig>): ErrorLearner {
  return new DefaultErrorLearner(config, retryConfig);
}
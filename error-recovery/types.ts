/**
 * error-recovery/types.ts — Shared types for error recovery
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorPattern {
  id: string;
  /** Signature — typically `error.name + ': ' + error.code` */
  signature: string;
  /** Regex used to match errors */
  matchPattern: string;
  /** Recovery procedure (ordered list of actions) */
  recoveryProcedure: RecoveryStep[];
  /** How many times this pattern has matched successfully */
  successCount: number;
  /** How many times this pattern has failed */
  failureCount: number;
  /** Severity when this pattern matches */
  severity: ErrorSeverity;
  /** When pattern was created */
  createdAt: number;
  /** When pattern was last updated */
  updatedAt: number;
}

export interface RecoveryStep {
  /** What kind of action */
  action: 'log' | 'retry' | 'patch' | 'rollback' | 'escalate' | 'wait';
  /** Action-specific data */
  params?: Record<string, unknown>;
  /** Optional human-readable note */
  note?: string;
}

export interface RetryAttempt {
  attempt: number;
  delayMs: number;
  error: string;
  timestamp: number;
}

export interface RecoveryResult {
  success: boolean;
  patternApplied?: ErrorPattern;
  attempts: RetryAttempt[];
  rootCause?: string;
  totalDurationMs: number;
  finalError?: string;
}

export interface ErrorLearnerConfig {
  /** Max patterns to keep in memory */
  maxPatterns?: number;
  /** Pattern DB persistence path */
  patternDbPath?: string;
  /** Whether to persist patterns to disk */
  persist?: boolean;
}

export interface ErrorLearner {
  recordError(error: Error, context?: { module?: string; tags?: string[] }): ErrorPattern;
  findMatch(error: Error): ErrorPattern | null;
  applyRecovery(error: Error): Promise<RecoveryResult>;
  getErrorPatterns(): Promise<Array<{ id: string; signature: string }>>;
  getPatternsByTag(tag: string): ErrorPattern[];
  getStats(): {
    totalPatterns: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: number;
  };
}
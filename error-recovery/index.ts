/**
 * error-recovery — Self-learning error recovery engine (pure logic)
 *
 * Exports:
 *  - createErrorLearner() → ErrorLearner (main entry)
 *  - computeSignature, signatureToRegex, defaultRecovery (helpers)
 *  - computeRetryDelay, withRetry, DEFAULT_RETRY_CONFIG (retry strategies)
 *  - PatternDB class (direct access)
 */

export type {
  ErrorPattern,
  ErrorSeverity,
  RecoveryStep,
  RetryAttempt,
  RecoveryResult,
  ErrorLearner,
  ErrorLearnerConfig,
} from './types';

export {
  PatternDB,
  computeSignature,
  signatureToRegex,
  defaultRecovery,
  generatePatternId,
  scanForErrorSignatures,
} from './pattern_db';

export {
  withRetry,
  computeRetryDelay,
  DEFAULT_RETRY_CONFIG,
  type RetryStrategyName,
  type RetryConfig,
} from './retry_strategies';

export { DefaultErrorLearner, createErrorLearner } from './error_learner';
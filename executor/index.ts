/**
 * executor — Autonomous task runner with subagent coordination (pure logic)
 *
 * Capabilities:
 *  1. AutonomousRunner — runs tasks sequentially/in parallel with retry + audit
 *  2. RateLimiter — token bucket, prevents runaway task flood
 *  3. SubAgentCoordinator — distributes tasks across capability-matched agents
 *  4. No subprocesses — pure JS, safe for many concurrent instances
 *
 * Public API:
 *   const exec = getExecutor();
 *   const runner = createAutonomousRunner({ maxConcurrency: 4 });
 *   const result = await runner.runTask({ id: 'x', name: 'demo', execute: async () => 42 });
 */

export type {
  ExecutorTask,
  ExecutorResult,
  TaskRunnerConfig,
  TaskState,
  RetryStrategy,
  SubAgentSpec,
  SubAgentState,
} from './types';

export { AutonomousRunner, RateLimiter, computeRetryDelay } from './autonomous_runner';
import { AutonomousRunner } from './autonomous_runner';

export {
  SubAgentCoordinator,
  type CoordinationConfig,
  type CoordinationResult,
} from './subagent_coordinator';
import { SubAgentCoordinator } from './subagent_coordinator';

// ==================== LEGACY COMPATIBILITY ====================

export interface Executor {
  name(): string;
}

/**
 * Get the legacy stub-compatible Executor. Use AutonomousRunner / SubAgentCoordinator directly instead.
 */
export function getExecutor(): Executor {
  return { name: () => 'autonomous-runner' };
}

/**
 * Factory: create a fresh AutonomousRunner with custom config
 */
export function createAutonomousRunner(config?: import('./types').TaskRunnerConfig): AutonomousRunner {
  return new AutonomousRunner(config);
}

/**
 * Factory: create a fresh SubAgentCoordinator with custom config
 */
export function createSubAgentCoordinator(config?: import('./subagent_coordinator').CoordinationConfig): SubAgentCoordinator {
  return new SubAgentCoordinator(config);
}
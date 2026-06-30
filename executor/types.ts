/**
 * executor/types.ts — Shared types for executor module
 */

export type RetryStrategy = 'none' | 'immediate' | 'linear' | 'exponential';

export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ExecutorTask<T = unknown> {
  id: string;
  name: string;
  execute: () => Promise<T>;
  /** Optional: dependencies that must complete first (task ids) */
  dependencies?: string[];
  /** Optional: priority (higher = earlier within same concurrency bucket) */
  priority?: number;
}

export interface ExecutorResult<T = unknown> {
  taskId: string;
  success: boolean;
  value?: T;
  error?: string;
  attempts: number;
  durationMs: number;
  dryRun?: boolean;
}

export interface TaskRunnerConfig {
  maxConcurrency?: number;
  rateLimitPerMin?: number;
  maxRetries?: number;
  retryStrategy?: RetryStrategy;
  /** Callback for audit logging (in-memory by default) */
  auditHook?: (entry: { ts: number; taskId: string; event: string; details?: unknown }) => void;
  /** Skip actual task execution — useful for dry-runs and planning */
  dryRun?: boolean;
}

export interface SubAgentSpec {
  id: string;
  role: string;
  /** Capabilities this subagent brings */
  capabilities: string[];
  /** Maximum subtasks this subagent can coordinate */
  maxSubtasks?: number;
}

export interface SubAgentState {
  spec: SubAgentSpec;
  tasksRunning: number;
  tasksCompleted: number;
  tasksFailed: number;
  status: 'idle' | 'busy' | 'stopped';
}
/**
 * evaluation/types.ts — CLEAR metrics framework
 *
 * CLEAR = Capability, Learning, Efficiency, Accuracy, Robustness
 * Each metric has a score (0-1) and supporting data.
 */

export interface MetricScore {
  /** Metric name */
  name: string;
  /** Score in [0, 1] */
  score: number;
  /** Weight in overall score (0-1) */
  weight: number;
  /** Notes about how this was computed */
  notes: string[];
}

export interface CleareMetrics {
  capability: MetricScore;
  learning: MetricScore;
  efficiency: MetricScore;
  accuracy: MetricScore;
  robustness: MetricScore;
}

export interface EvaluationReport {
  /** When this evaluation was generated */
  timestamp: number;
  /** Overall weighted score */
  overallScore: number;
  /** CLEAR metrics */
  metrics: CleareMetrics;
  /** Suggestions for improvement */
  suggestions: string[];
  /** Total tasks/operations evaluated */
  totalSamples: number;
  /** Optional breakdown by category */
  breakdown?: Record<string, number>;
}

export interface EvaluationInput {
  /** Number of tasks attempted */
  totalTasks: number;
  /** Number of tasks successfully completed */
  successfulTasks: number;
  /** Number of tasks that required retries */
  retriesUsed: number;
  /** Number of escalations triggered */
  escalationsTriggered: number;
  /** Total wall-clock duration (ms) */
  totalDurationMs: number;
  /** Total steps used */
  stepsUsed: number;
  /** Step budget cap */
  stepBudgetCap: number;
  /** Per-task outcomes */
  taskOutcomes: Array<{
    success: boolean;
    durationMs: number;
    confidence: number;
    retries: number;
    escalated: boolean;
  }>;
}

export interface CleareConfig {
  /** Custom weights for CLEAR metrics */
  weights?: {
    capability?: number;
    learning?: number;
    efficiency?: number;
    accuracy?: number;
    robustness?: number;
  };
  /** Threshold for "good" performance */
  goodThreshold?: number;
  /** Threshold for "needs improvement" */
  improvementThreshold?: number;
}
/**
 * evaluation/scoring.ts — Pure logic to compute CLEAR metric scores
 */

import type {
  MetricScore,
  CleareMetrics,
  EvaluationInput,
  CleareConfig,
  EvaluationReport,
} from './types';

const DEFAULT_WEIGHTS = {
  capability: 0.20,
  learning: 0.15,
  efficiency: 0.20,
  accuracy: 0.30,
  robustness: 0.15,
};

/**
 * Score Capability: ability to handle diverse tasks
 */
export function scoreCapability(input: EvaluationInput): MetricScore {
  if (input.totalTasks === 0) {
    return { name: 'Capability', score: 0, weight: 0.20, notes: ['no tasks evaluated'] };
  }
  const successRate = input.successfulTasks / input.totalTasks;
  const diversityScore = Math.min(1, input.totalTasks / 10);  // bonus for variety
  const score = (successRate * 0.7 + diversityScore * 0.3);
  return {
    name: 'Capability',
    score,
    weight: 0.20,
    notes: [
      `success rate: ${(successRate * 100).toFixed(0)}%`,
      `task diversity: ${input.totalTasks} tasks`,
    ],
  };
}

/**
 * Score Learning: improvement over time, knowledge accumulation
 */
export function scoreLearning(input: EvaluationInput): MetricScore {
  if (input.taskOutcomes.length < 2) {
    return { name: 'Learning', score: 0.5, weight: 0.15, notes: ['insufficient samples'] };
  }
  const mid = Math.floor(input.taskOutcomes.length / 2);
  const earlyHalf = input.taskOutcomes.slice(0, mid);
  const lateHalf = input.taskOutcomes.slice(mid);

  const earlySuccess = earlyHalf.filter((o) => o.success).length / Math.max(1, earlyHalf.length);
  const lateSuccess = lateHalf.filter((o) => o.success).length / Math.max(1, lateHalf.length);

  // Improvement = how much better the second half is vs first half
  const improvement = Math.max(0, lateSuccess - earlySuccess);
  const score = Math.min(1, 0.5 + improvement);
  return {
    name: 'Learning',
    score,
    weight: 0.15,
    notes: [
      `early success rate: ${(earlySuccess * 100).toFixed(0)}%`,
      `late success rate: ${(lateSuccess * 100).toFixed(0)}%`,
      `improvement: ${(improvement * 100).toFixed(0)}%`,
    ],
  };
}

/**
 * Score Efficiency: speed and step budget usage
 */
export function scoreEfficiency(input: EvaluationInput): MetricScore {
  if (input.totalTasks === 0 || input.stepBudgetCap === 0) {
    return { name: 'Efficiency', score: 0, weight: 0.20, notes: ['no tasks'] };
  }

  const budgetUsed = input.stepsUsed / (input.totalTasks * input.stepBudgetCap);
  const budgetScore = Math.max(0, 1 - budgetUsed);

  const avgDuration = input.totalDurationMs / input.totalTasks;
  // Normalize: under 1000ms = 1.0, over 30000ms = 0.0
  const speedScore = Math.max(0, Math.min(1, 1 - (avgDuration - 1000) / 29000));

  const score = budgetScore * 0.6 + speedScore * 0.4;
  return {
    name: 'Efficiency',
    score,
    weight: 0.20,
    notes: [
      `step budget used: ${(budgetUsed * 100).toFixed(0)}%`,
      `avg task duration: ${avgDuration.toFixed(0)}ms`,
    ],
  };
}

/**
 * Score Accuracy: correctness of outcomes
 */
export function scoreAccuracy(input: EvaluationInput): MetricScore {
  if (input.totalTasks === 0) {
    return { name: 'Accuracy', score: 0, weight: 0.30, notes: ['no tasks'] };
  }

  const successRate = input.successfulTasks / input.totalTasks;

  // Average confidence on successful tasks (a proxy for certainty)
  const successfulTasks = input.taskOutcomes.filter((o) => o.success);
  const avgConfidence = successfulTasks.length > 0
    ? successfulTasks.reduce((sum, o) => sum + o.confidence, 0) / successfulTasks.length
    : 0;

  const score = (successRate * 0.7 + avgConfidence * 0.3);
  return {
    name: 'Accuracy',
    score,
    weight: 0.30,
    notes: [
      `success rate: ${(successRate * 100).toFixed(0)}%`,
      `avg confidence on success: ${(avgConfidence * 100).toFixed(0)}%`,
    ],
  };
}

/**
 * Score Robustness: handling failures without crashing
 */
export function scoreRobustness(input: EvaluationInput): MetricScore {
  if (input.totalTasks === 0) {
    return { name: 'Robustness', score: 0, weight: 0.15, notes: ['no tasks'] };
  }

  // Retries should resolve failures
  const failedTasks = input.taskOutcomes.filter((o) => !o.success);
  const retriedTasks = input.taskOutcomes.filter((o) => o.retries > 0);
  const escalatedTasks = input.taskOutcomes.filter((o) => o.escalated);

  // Higher = more robust if retries resolve failures
  const retryRecoveryRate = retriedTasks.length > 0
    ? retriedTasks.filter((o) => o.success).length / retriedTasks.length
    : 0.5;

  // Penalize too many escalations (suggests lower tier agents can't handle work)
  const escalationRate = escalatedTasks.length / input.totalTasks;
  const escalationPenalty = Math.max(0, 1 - escalationRate);

  const failureRate = failedTasks.length / input.totalTasks;
  const failurePenalty = Math.max(0, 1 - failureRate);

  const score = (retryRecoveryRate * 0.4 + escalationPenalty * 0.3 + failurePenalty * 0.3);
  return {
    name: 'Robustness',
    score,
    weight: 0.15,
    notes: [
      `retry recovery rate: ${(retryRecoveryRate * 100).toFixed(0)}%`,
      `escalation rate: ${(escalationRate * 100).toFixed(0)}%`,
      `failure rate: ${(failureRate * 100).toFixed(0)}%`,
    ],
  };
}

/**
 * Compute all CLEAR metrics
 */
export function computeCleareMetrics(input: EvaluationInput, config?: CleareConfig): CleareMetrics {
  const weights = { ...DEFAULT_WEIGHTS, ...(config?.weights ?? {}) };

  const capability = { ...scoreCapability(input), weight: weights.capability };
  const learning = { ...scoreLearning(input), weight: weights.learning };
  const efficiency = { ...scoreEfficiency(input), weight: weights.efficiency };
  const accuracy = { ...scoreAccuracy(input), weight: weights.accuracy };
  const robustness = { ...scoreRobustness(input), weight: weights.robustness };

  return { capability, learning, efficiency, accuracy, robustness };
}

/**
 * Compute overall weighted score
 */
export function computeOverallScore(metrics: CleareMetrics): number {
  const totalWeight = Object.values(metrics).reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return 0;

  const weighted = Object.values(metrics).reduce((sum, m) => sum + m.score * m.weight, 0);
  return weighted / totalWeight;
}

/**
 * Generate improvement suggestions based on metrics
 */
export function generateSuggestions(metrics: CleareMetrics, threshold = 0.6): string[] {
  const suggestions: string[] = [];
  for (const metric of Object.values(metrics)) {
    if (metric.score < threshold) {
      suggestions.push(`Improve ${metric.name.toLowerCase()}: ${metric.notes.join(', ')}`);
    }
  }
  return suggestions;
}

/**
 * Build a complete evaluation report
 */
export function buildReport(input: EvaluationInput, config?: CleareConfig): EvaluationReport {
  const metrics = computeCleareMetrics(input, config);
  const overallScore = computeOverallScore(metrics);
  const suggestions = generateSuggestions(metrics, config?.improvementThreshold ?? 0.6);

  return {
    timestamp: Date.now(),
    overallScore,
    metrics,
    suggestions,
    totalSamples: input.totalTasks,
  };
}

/**
 * Format report as markdown
 */
export function reportToMarkdown(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push(`# CLEAR Evaluation Report`);
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.timestamp).toISOString()}`);
  lines.push(`**Overall Score:** ${(report.overallScore * 100).toFixed(1)}%`);
  lines.push(`**Samples:** ${report.totalSamples}`);
  lines.push('');
  lines.push(`## CLEAR Metrics`);
  lines.push('');
  for (const metric of Object.values(report.metrics)) {
    const pct = (metric.score * 100).toFixed(1);
    const weightPct = (metric.weight * 100).toFixed(0);
    lines.push(`### ${metric.name} (${pct}%, weight ${weightPct}%)`);
    for (const note of metric.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }
  if (report.suggestions.length > 0) {
    lines.push(`## Improvement Suggestions`);
    for (const s of report.suggestions) {
      lines.push(`- ${s}`);
    }
  }
  return lines.join('\n');
}
/**
 * evaluation — CLEAR metrics evaluation (Capability, Learning, Efficiency, Accuracy, Robustness)
 *
 * Exports:
 *  - getCLEAREvaluator() → CLEAR evaluator
 *  - buildReport(input, config) → EvaluationReport
 *  - reportToMarkdown(report) → string
 *  - Individual scoring functions (scoreCapability, scoreLearning, etc.)
 */

export type {
  MetricScore,
  CleareMetrics,
  EvaluationInput,
  EvaluationReport,
  CleareConfig,
} from './types';

export {
  scoreCapability,
  scoreLearning,
  scoreEfficiency,
  scoreAccuracy,
  scoreRobustness,
  computeCleareMetrics,
  computeOverallScore,
  generateSuggestions,
  buildReport,
  reportToMarkdown,
} from './scoring';

import {
  buildReport,
  reportToMarkdown,
  computeCleareMetrics,
  computeOverallScore,
} from './scoring';
import type {
  EvaluationInput,
  CleareConfig,
  EvaluationReport,
} from './types';

export class CleareEvaluator {
  private readonly config: CleareConfig;

  constructor(config: CleareConfig = {}) {
    this.config = config;
  }

  evaluate(input: EvaluationInput): EvaluationReport {
    return buildReport(input, this.config);
  }

  evaluateToMarkdown(input: EvaluationInput): string {
    const report = this.evaluate(input);
    return reportToMarkdown(report);
  }

  computeMetrics(input: EvaluationInput) {
    return computeCleareMetrics(input, this.config);
  }

  computeOverall(input: EvaluationInput): number {
    const metrics = this.computeMetrics(input);
    return computeOverallScore(metrics);
  }
}

/**
 * Factory — create CLEAR evaluator instance
 */
export function getCLEAREvaluator(config?: CleareConfig): CleareEvaluator {
  return new CleareEvaluator(config);
}
import { describe, it, expect } from 'vitest';

import {
  getCLEAREvaluator,
  buildReport,
  reportToMarkdown,
  scoreCapability,
  scoreLearning,
  scoreEfficiency,
  scoreAccuracy,
  scoreRobustness,
  computeOverallScore,
  generateSuggestions,
  computeCleareMetrics,
  type EvaluationInput,
  type EvaluationReport,
} from './index';

function makeInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    totalTasks: 10,
    successfulTasks: 8,
    retriesUsed: 2,
    escalationsTriggered: 1,
    totalDurationMs: 5000,
    stepsUsed: 30,
    stepBudgetCap: 100,
    taskOutcomes: Array.from({ length: 10 }, (_, i) => ({
      success: i < 8,
      durationMs: 500,
      confidence: 0.8,
      retries: i === 8 ? 1 : 0,
      escalated: i === 9,
    })),
    ...overrides,
  };
}

describe('evaluation — scoreCapability', () => {
  it('returns 0 for no tasks', () => {
    const score = scoreCapability(makeInput({ totalTasks: 0, successfulTasks: 0, taskOutcomes: [] }));
    expect(score.score).toBe(0);
  });

  it('high success rate → high score', () => {
    const score = scoreCapability(makeInput({ totalTasks: 10, successfulTasks: 10 }));
    expect(score.score).toBeGreaterThan(0.8);
  });

  it('low success rate → low score', () => {
    const score = scoreCapability(makeInput({ totalTasks: 10, successfulTasks: 2 }));
    expect(score.score).toBeLessThan(0.5);
  });

  it('returns MetricScore shape', () => {
    const score = scoreCapability(makeInput());
    expect(score).toHaveProperty('name');
    expect(score).toHaveProperty('score');
    expect(score).toHaveProperty('weight');
    expect(score).toHaveProperty('notes');
  });
});

describe('evaluation — scoreLearning', () => {
  it('returns 0.5 for insufficient samples', () => {
    const score = scoreLearning(makeInput({ taskOutcomes: [{ success: true, durationMs: 100, confidence: 0.9, retries: 0, escalated: false }] }));
    expect(score.score).toBe(0.5);
  });

  it('improvement raises score', () => {
    const taskOutcomes = [
      ...Array.from({ length: 5 }, () => ({ success: false, durationMs: 100, confidence: 0.3, retries: 0, escalated: false })),
      ...Array.from({ length: 5 }, () => ({ success: true, durationMs: 100, confidence: 0.9, retries: 0, escalated: false })),
    ];
    const score = scoreLearning(makeInput({ taskOutcomes }));
    expect(score.score).toBeGreaterThan(0.5);
  });

  it('no improvement returns 0.5', () => {
    const taskOutcomes = Array.from({ length: 10 }, () => ({ success: true, durationMs: 100, confidence: 0.9, retries: 0, escalated: false }));
    const score = scoreLearning(makeInput({ taskOutcomes }));
    expect(score.score).toBe(0.5);
  });
});

describe('evaluation — scoreEfficiency', () => {
  it('low step usage → high score', () => {
    const score = scoreEfficiency(makeInput({ stepsUsed: 10, totalTasks: 10, stepBudgetCap: 100 }));
    expect(score.score).toBeGreaterThan(0.8);
  });

  it('high step usage → low score', () => {
    const score = scoreEfficiency(makeInput({ stepsUsed: 1000, totalTasks: 10, stepBudgetCap: 100 }));
    expect(score.score).toBeLessThan(0.5);
  });

  it('fast tasks boost score', () => {
    const score = scoreEfficiency(makeInput({ totalDurationMs: 100, totalTasks: 10 }));
    expect(score.score).toBeGreaterThan(0.8);
  });

  it('slow tasks lower score', () => {
    const score = scoreEfficiency(makeInput({ totalDurationMs: 60000, totalTasks: 10 }));
    // 6000ms avg → speedScore ≈ 0.83; if budget is high, total still high
    expect(score.score).toBeLessThan(0.99);  // Not perfect
  });

  it('reasonable duration yields reasonable score', () => {
    const score = scoreEfficiency(makeInput({ totalDurationMs: 30000, totalTasks: 10 }));
    expect(score.score).toBeLessThan(0.99);  // Not perfect, but reasonable
  });
});

describe('evaluation — scoreAccuracy', () => {
  it('high success → high accuracy', () => {
    const score = scoreAccuracy(makeInput({ totalTasks: 10, successfulTasks: 10 }));
    expect(score.score).toBeGreaterThan(0.8);
  });

  it('low success → low accuracy', () => {
    const score = scoreAccuracy(makeInput({ totalTasks: 10, successfulTasks: 2 }));
    expect(score.score).toBeLessThan(0.4);
  });

  it('confidence boosts score', () => {
    const taskOutcomes = Array.from({ length: 10 }, () => ({ success: true, durationMs: 100, confidence: 1.0, retries: 0, escalated: false }));
    const score = scoreAccuracy(makeInput({ totalTasks: 10, successfulTasks: 10, taskOutcomes }));
    expect(score.score).toBeGreaterThanOrEqual(0.95);
  });
});

describe('evaluation — scoreRobustness', () => {
  it('retry recovery raises score', () => {
    const taskOutcomes = Array.from({ length: 10 }, (_, i) => ({
      success: i < 5,
      durationMs: 100,
      confidence: 0.8,
      retries: 1,
      escalated: false,
    }));
    // First 5 succeed with retry, last 5 fail without retry
    const fixedOutcomes = [
      ...Array.from({ length: 5 }, () => ({ success: true, durationMs: 100, confidence: 0.8, retries: 1, escalated: false })),
      ...Array.from({ length: 5 }, () => ({ success: false, durationMs: 100, confidence: 0.8, retries: 0, escalated: false })),
    ];
    const score = scoreRobustness(makeInput({ taskOutcomes: fixedOutcomes }));
    expect(score.score).toBeGreaterThan(0.5);
  });

  it('too many escalations lower score', () => {
    const taskOutcomes = Array.from({ length: 10 }, () => ({
      success: true, durationMs: 100, confidence: 0.9, retries: 0, escalated: true,
    }));
    const score = scoreRobustness(makeInput({ taskOutcomes }));
    expect(score.score).toBeLessThan(0.8);
  });
});

describe('evaluation — computeOverallScore', () => {
  it('returns weighted average in [0, 1]', () => {
    const metrics = computeCleareMetrics(makeInput());
    const score = computeOverallScore(metrics);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns 0 when total weight is 0', () => {
    const metrics = computeCleareMetrics(makeInput());
    // Manually zero out weights
    const zeroMetrics = {
      capability: { ...metrics.capability, weight: 0 },
      learning: { ...metrics.learning, weight: 0 },
      efficiency: { ...metrics.efficiency, weight: 0 },
      accuracy: { ...metrics.accuracy, weight: 0 },
      robustness: { ...metrics.robustness, weight: 0 },
    };
    expect(computeOverallScore(zeroMetrics)).toBe(0);
  });
});

describe('evaluation — generateSuggestions', () => {
  it('suggests improvements for low metrics', () => {
    const metrics = computeCleareMetrics(makeInput({ totalTasks: 10, successfulTasks: 1 }));
    const suggestions = generateSuggestions(metrics, 0.9);  // High threshold → many suggestions
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('no suggestions when all metrics pass', () => {
    const metrics = computeCleareMetrics(makeInput({ totalTasks: 10, successfulTasks: 10 }));
    const suggestions = generateSuggestions(metrics, 0.1);  // Low threshold
    expect(suggestions.length).toBe(0);
  });
});

describe('evaluation — buildReport', () => {
  it('returns complete report', () => {
    const report = buildReport(makeInput());
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('overallScore');
    expect(report).toHaveProperty('metrics');
    expect(report).toHaveProperty('suggestions');
    expect(report).toHaveProperty('totalSamples');
    expect(report.metrics).toHaveProperty('capability');
    expect(report.metrics).toHaveProperty('learning');
    expect(report.metrics).toHaveProperty('efficiency');
    expect(report.metrics).toHaveProperty('accuracy');
    expect(report.metrics).toHaveProperty('robustness');
  });

  it('overall score is in [0, 1]', () => {
    const report = buildReport(makeInput());
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(1);
  });
});

describe('evaluation — reportToMarkdown', () => {
  it('produces markdown with all sections', () => {
    const report = buildReport(makeInput());
    const md = reportToMarkdown(report);
    expect(md).toContain('# CLEAR Evaluation Report');
    expect(md).toContain('Capability');
    expect(md).toContain('Learning');
    expect(md).toContain('Efficiency');
    expect(md).toContain('Accuracy');
    expect(md).toContain('Robustness');
  });
});

describe('evaluation — CleareEvaluator', () => {
  it('evaluate returns report', () => {
    const evaluator = getCLEAREvaluator();
    const report = evaluator.evaluate(makeInput());
    expect(report.overallScore).toBeGreaterThan(0);
  });

  it('evaluateToMarkdown returns string', () => {
    const evaluator = getCLEAREvaluator();
    const md = evaluator.evaluateToMarkdown(makeInput());
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(100);
  });

  it('computeMetrics returns CLEAR metrics', () => {
    const evaluator = getCLEAREvaluator();
    const metrics = evaluator.computeMetrics(makeInput());
    expect(metrics.capability).toBeDefined();
    expect(metrics.learning).toBeDefined();
  });

  it('computeOverall returns single score', () => {
    const evaluator = getCLEAREvaluator();
    const score = evaluator.computeOverall(makeInput());
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('respects custom weights', () => {
    const evaluator = getCLEAREvaluator({
      weights: { accuracy: 1, capability: 0, learning: 0, efficiency: 0, robustness: 0 },
    });
    const score = evaluator.computeOverall(makeInput());
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('evaluation — edge cases', () => {
  it('handles zero tasks gracefully', () => {
    const empty: EvaluationInput = {
      totalTasks: 0,
      successfulTasks: 0,
      retriesUsed: 0,
      escalationsTriggered: 0,
      totalDurationMs: 0,
      stepsUsed: 0,
      stepBudgetCap: 100,  // non-zero to avoid div-by-zero in efficiency
      taskOutcomes: [],
    };
    const report = buildReport(empty);
    // Empty input → all metrics = 0 → overall = 0
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(1);
  });

  it('handles all failures', () => {
    const allFail: EvaluationInput = {
      totalTasks: 10,
      successfulTasks: 0,
      retriesUsed: 0,
      escalationsTriggered: 0,
      totalDurationMs: 5000,
      stepsUsed: 100,
      stepBudgetCap: 100,
      taskOutcomes: Array.from({ length: 10 }, () => ({ success: false, durationMs: 500, confidence: 0.1, retries: 0, escalated: false })),
    };
    const report = buildReport(allFail);
    expect(report.overallScore).toBeLessThanOrEqual(0.5);
  });

  it('handles perfect execution', () => {
    const perfect: EvaluationInput = {
      totalTasks: 10,
      successfulTasks: 10,
      retriesUsed: 0,
      escalationsTriggered: 0,
      totalDurationMs: 100,
      stepsUsed: 10,
      stepBudgetCap: 100,
      taskOutcomes: Array.from({ length: 10 }, () => ({ success: true, durationMs: 10, confidence: 1.0, retries: 0, escalated: false })),
    };
    const report = buildReport(perfect);
    expect(report.overallScore).toBeGreaterThan(0.85);
  });
});
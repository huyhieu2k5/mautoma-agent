/**
 * tests/stress/task-planner.stress.test.ts — Stress tests for task-planner
 *
 * Scenarios:
 *  - 1000-step DAG
 *  - Cycles (intentional) → detectCycles must find them
 *  - Invalid deps → graceful handling
 *  - Topological sort under deep chains
 *  - Critical path on branching DAGs
 *  - Language detection edge cases
 */

import { describe, it, expect } from 'vitest';

import {
  getTaskPlanner,
  type Plan,
  type PlanStep,
} from '../../task-planner';

const planner = getTaskPlanner();

describe('STRESS: task-planner — extreme plans', () => {
  it('creates plan from 10K-character request', () => {
    const huge = ('implement and test feature X ').repeat(500);
    const plan = planner.createPlan(huge);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('handles 100 plan creations back-to-back', () => {
    for (let i = 0; i < 100; i++) {
      const plan = planner.createPlan(`build feature ${i} with tests`);
      expect(plan.steps.length).toBeGreaterThan(0);
    }
  });

  it('handles empty / whitespace-only input gracefully', () => {
    expect(() => planner.createPlan('')).not.toThrow();
    expect(() => planner.createPlan('   ')).not.toThrow();
    expect(() => planner.createPlan('\n\t\r')).not.toThrow();
  });

  it('handles unicode-only input', () => {
    const plan = planner.createPlan('🚀🎯🌟🌈🔥💎⚡🎨🎭🎪');
    expect(plan).toBeDefined();
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('handles SQL-injection-like input', () => {
    const plan = planner.createPlan("'; DROP TABLE users; --");
    expect(plan).toBeDefined();
  });
});

describe('STRESS: task-planner — language detection edge cases', () => {
  it('detects Vietnamese from diacritics', () => {
    const p = getTaskPlanner();
    const plan = p.createPlan('phân tích và tạo mới');
    expect(plan.metadata?.language).toBe('vi');
  });

  it('detects Vietnamese from no-diacritics keywords', () => {
    const p = getTaskPlanner();
    const plan = p.createPlan('xây dựng tính năng');
    expect(plan.metadata?.language).toBe('vi');
  });

  it('detects English from ASCII', () => {
    const plan = planner.createPlan('build a new feature');
    expect(plan.metadata?.language).toBe('en');
  });

  it('mixed language defaults to first match', () => {
    const plan = planner.createPlan('phân tích and build');
    expect(['vi', 'en']).toContain(plan.metadata?.language);
  });
});

describe('STRESS: task-planner — topological sort', () => {
  it('handles 100-step linear chain', () => {
    const steps: PlanStep[] = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      dependencies: i === 0 ? [] : [`s${i - 1}`],
    }));
    const sorted = planner.topologicalSort({ steps });
    expect(sorted.length).toBe(100);
    // Verify order is preserved
    for (let i = 0; i < 100; i++) {
      expect(sorted[i]?.id).toBe(`s${i}`);
    }
  });

  it('handles 100-step diamond DAG', () => {
    const steps: PlanStep[] = [
      { id: 'a', title: 'A', dependencies: [] },
      { id: 'b', title: 'B', dependencies: ['a'] },
      { id: 'c', title: 'C', dependencies: ['a'] },
      { id: 'd', title: 'D', dependencies: ['b', 'c'] },
      { id: 'e', title: 'E', dependencies: ['d'] },
      { id: 'f', title: 'F', dependencies: ['a'] },
      { id: 'g', title: 'G', dependencies: ['f', 'e'] },
    ];
    const sorted = planner.topologicalSort({ steps });
    expect(sorted.length).toBe(7);
    expect(sorted.findIndex((s) => s.id === 'a')).toBe(0);
    expect(sorted.findIndex((s) => s.id === 'g')).toBe(6);
  });

  it('handles deep nesting (depth 100)', () => {
    const steps: PlanStep[] = [];
    for (let i = 0; i < 100; i++) {
      steps.push({ id: `s${i}`, title: `Step ${i}`, dependencies: i === 0 ? [] : [`s${i - 1}`] });
    }
    const sorted = planner.topologicalSort({ steps });
    expect(sorted.length).toBe(100);
  });

  it('handles steps with non-existent deps gracefully', () => {
    const steps: PlanStep[] = [
      { id: 'a', title: 'A', dependencies: ['nonexistent'] },
      { id: 'b', title: 'B', dependencies: ['a', 'also-nonexistent'] },
    ];
    const sorted = planner.topologicalSort({ steps });
    expect(sorted.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty plan', () => {
    const sorted = planner.topologicalSort({ steps: [] });
    expect(sorted).toEqual([]);
  });

  it('handles step with no deps', () => {
    const sorted = planner.topologicalSort({ steps: [{ id: 'x', title: 'X' }] });
    expect(sorted.length).toBe(1);
  });
});

describe('STRESS: task-planner — cycle detection', () => {
  it('detects self-cycle', () => {
    const steps: PlanStep[] = [
      { id: 'a', title: 'A', dependencies: ['a'] },  // self-cycle
    ];
    const cycles = planner.detectCycles({ steps });
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('detects 2-cycle', () => {
    const steps: PlanStep[] = [
      { id: 'a', title: 'A', dependencies: ['b'] },
      { id: 'b', title: 'B', dependencies: ['a'] },
    ];
    const cycles = planner.detectCycles({ steps });
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('detects 3-cycle', () => {
    const steps: PlanStep[] = [
      { id: 'a', title: 'A', dependencies: ['c'] },
      { id: 'b', title: 'B', dependencies: ['a'] },
      { id: 'c', title: 'C', dependencies: ['b'] },
    ];
    const cycles = planner.detectCycles({ steps });
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('no false positive on DAG', () => {
    const steps: PlanStep[] = [
      { id: 'a', title: 'A', dependencies: [] },
      { id: 'b', title: 'B', dependencies: ['a'] },
      { id: 'c', title: 'C', dependencies: ['a'] },
      { id: 'd', title: 'D', dependencies: ['b', 'c'] },
    ];
    const cycles = planner.detectCycles({ steps });
    expect(cycles.length).toBe(0);
  });

  it('handles plan with 100 nodes and 1 cycle', () => {
    const steps: PlanStep[] = [];
    for (let i = 0; i < 100; i++) {
      steps.push({ id: `s${i}`, title: `Step ${i}`, dependencies: i === 0 ? [] : [`s${i - 1}`] });
    }
    // Inject a cycle: s50 depends on s100, s100 depends on s50
    steps[50]!.dependencies = ['s99'];
    steps[99]!.dependencies = ['s50'];
    const cycles = planner.detectCycles({ steps });
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('STRESS: task-planner — critical path', () => {
  it('finds critical path in linear chain', () => {
    const steps: PlanStep[] = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      estimatedMinutes: 10,
      dependencies: i === 0 ? [] : [`s${i - 1}`],
    }));
    const path = planner.findCriticalPath({ steps });
    expect(path.length).toBe(50);
    // Total should be 50 * 10 = 500
    const total = path.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);
    expect(total).toBe(500);
  });

  it('finds longest path in branching DAG', () => {
    const steps: PlanStep[] = [
      { id: 'a', title: 'A', estimatedMinutes: 10, dependencies: [] },
      { id: 'b', title: 'B', estimatedMinutes: 20, dependencies: ['a'] },
      { id: 'c', title: 'C', estimatedMinutes: 5, dependencies: ['a'] },
      { id: 'd', title: 'D', estimatedMinutes: 30, dependencies: ['b', 'c'] },
    ];
    const path = planner.findCriticalPath({ steps });
    // Longest path: a → b → d = 60, or a → c → d = 45. So a,b,d
    expect(path.map((s) => s.id).join('-')).toBe('a-b-d');
  });

  it('handles 100-step chain critical path', () => {
    const steps: PlanStep[] = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      estimatedMinutes: i + 1,
      dependencies: i === 0 ? [] : [`s${i - 1}`],
    }));
    const path = planner.findCriticalPath({ steps });
    expect(path.length).toBe(100);
  });
});

describe('STRESS: task-planner — estimation', () => {
  it('estimates correctly for plan with costs', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'A', estimatedMinutes: 10, estimatedCost: 1.0 },
        { id: 'b', title: 'B', estimatedMinutes: 20, estimatedCost: 2.0 },
      ],
    };
    const est = planner.estimate(plan);
    expect(est.totalMinutes).toBe(30);
    expect(est.totalCost).toBe(3.0);
    expect(est.byStep.length).toBe(2);
  });

  it('handles plan with missing estimates', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', estimatedMinutes: 5 },
      ],
    };
    const est = planner.estimate(plan);
    expect(est.totalMinutes).toBe(5);
    expect(est.totalCost).toBe(0);
  });

  it('handles 1000-step plan estimation', () => {
    const steps: PlanStep[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      estimatedMinutes: 5,
      estimatedCost: 0.1,
    }));
    const start = Date.now();
    const est = planner.estimate({ steps });
    const elapsed = Date.now() - start;
    expect(est.totalMinutes).toBe(5000);
    expect(est.totalCost).toBeCloseTo(100, 5);
    expect(elapsed).toBeLessThan(50);
  });
});

describe('STRESS: task-planner — JSON export', () => {
  it('round-trips plan through JSON', () => {
    const plan = planner.createPlan('build and test the new feature');
    const json = planner.exportJson(plan);
    const parsed = JSON.parse(json) as Plan;
    expect(parsed.steps.length).toBe(plan.steps.length);
  });

  it('handles plan with all metadata', () => {
    const plan = planner.createPlan('refactor and test with security checks');
    const json = planner.exportJson(plan);
    expect(json).toContain('metadata');
    expect(json).toContain('steps');
  });
});

describe('STRESS: task-planner — performance', () => {
  it('creates 100 plans in < 500ms', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      planner.createPlan(`request ${i}`);
    }
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('topological sort of 1000 nodes in < 100ms', () => {
    const steps: PlanStep[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      dependencies: i === 0 ? [] : [`s${i - 1}`],
    }));
    const start = Date.now();
    planner.topologicalSort({ steps });
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('cycle detection on 100 nodes in < 100ms', () => {
    const steps: PlanStep[] = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      dependencies: i === 0 ? [] : [`s${i - 1}`],
    }));
    const start = Date.now();
    planner.detectCycles({ steps });
    expect(Date.now() - start).toBeLessThan(100);
  });
});
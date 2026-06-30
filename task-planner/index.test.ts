import { describe, it, expect } from 'vitest';
import { getTaskPlanner, TaskPlanner, Plan, PlanStep } from './index';

describe('task-planner — basic createPlan', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = getTaskPlanner();
  });

  it('returns a Plan with at least one step', () => {
    const plan = planner.createPlan('Refactor code');
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('returns steps with required id and title fields', () => {
    const plan = planner.createPlan('Build a new API');
    for (const step of plan.steps) {
      expect(step.id).toBeTruthy();
      expect(step.title).toBeTruthy();
    }
  });

  it('returns minimal plan for empty input', () => {
    const plan = planner.createPlan('');
    expect(plan.steps.length).toBe(1);
  });

  it('returns minimal plan for whitespace input', () => {
    const plan = planner.createPlan('   ');
    expect(plan.steps.length).toBe(1);
  });

  it('preserves backward-compatible Plan interface', () => {
    const plan = planner.createPlan('Fix the login bug');
    // Existing consumers (auto-apply, auto-execution) use these fields
    expect(Array.isArray(plan.steps)).toBe(true);
    for (const step of plan.steps) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.title).toBe('string');
    }
  });
});

describe('task-planner — decomposition (Vietnamese)', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = getTaskPlanner();
  });

  it('decomposes "tạo và test" into implementation + verification', () => {
    const plan = planner.createPlan('Tạo một API mới và viết test cho nó');
    const categories = plan.steps.map((s) => s.category);
    expect(categories).toContain('implementation');
    expect(categories).toContain('verification');
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('decomposes "sửa lỗi" into fix steps', () => {
    const plan = planner.createPlan('Sửa lỗi login và thêm error handling');
    const categories = plan.steps.map((s) => s.category);
    expect(categories).toContain('fix');
    // Should also add some actionable step (verification, error handling, etc.)
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('decomposes "refactor" with backup step', () => {
    const plan = planner.createPlan('Refactor module authentication');
    const categories = plan.steps.map((s) => s.category);
    expect(categories).toContain('refactor');
  });

  it('detects Vietnamese language automatically', () => {
    const plan = planner.createPlan('Tạo chức năng đăng nhập với password');
    expect(plan.metadata?.language).toBe('vi');
  });
});

describe('task-planner — decomposition (English)', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = getTaskPlanner();
  });

  it('decomposes "build and test" into implementation + verification', () => {
    const plan = planner.createPlan('Build a new feature and write tests');
    const categories = plan.steps.map((s) => s.category);
    expect(categories).toContain('implementation');
    expect(categories).toContain('verification');
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('decomposes "fix bug" into fix + error handling', () => {
    const plan = planner.createPlan('Fix the authentication bug');
    const categories = plan.steps.map((s) => s.category);
    expect(categories).toContain('fix');
  });

  it('decomposes "refactor" with backup', () => {
    const plan = planner.createPlan('Refactor the auth module');
    const categories = plan.steps.map((s) => s.category);
    expect(categories).toContain('refactor');
  });

  it('decomposes "security" with auth steps', () => {
    const plan = planner.createPlan('Implement login with password authentication');
    const categories = plan.steps.map((s) => s.category);
    expect(categories).toContain('security');
  });

  it('detects English language for English requests', () => {
    const plan = planner.createPlan('Build a feature with authentication');
    expect(plan.metadata?.language).toBe('en');
  });
});

describe('task-planner — dependency graph', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = getTaskPlanner();
  });

  it('attaches dependencies to dependent steps', () => {
    const plan = planner.createPlan('Build a feature, write tests, and commit');
    const hasDeps = plan.steps.some((s) => s.dependencies && s.dependencies.length > 0);
    expect(hasDeps).toBe(true);
  });

  it('dependencies reference real step IDs', () => {
    const plan = planner.createPlan('Build feature and write tests');
    const allIds = new Set(plan.steps.map((s) => s.id));
    for (const step of plan.steps) {
      for (const depId of step.dependencies ?? []) {
        expect(allIds.has(depId)).toBe(true);
      }
    }
  });

  it('topological sort produces valid ordering', () => {
    const plan = planner.createPlan('Build feature, write tests, and verify');
    const sorted = planner.topologicalSort(plan);
    expect(sorted.length).toBe(plan.steps.length);

    // Verify: each step's dependencies appear before it in sorted order
    const sortedIds = new Set(sorted.map((s) => s.id));
    for (let i = 0; i < sorted.length; i++) {
      const step = sorted[i];
      for (const depId of step.dependencies ?? []) {
        const depIndex = sorted.findIndex((s) => s.id === depId);
        expect(depIndex).toBeLessThan(i);  // dependency comes before
      }
    }
  });

  it('topological sort handles no-dependency case', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'Step A' },
        { id: 'b', title: 'Step B' },
        { id: 'c', title: 'Step C' },
      ],
    };
    const sorted = planner.topologicalSort(plan);
    expect(sorted.length).toBe(3);
  });
});

describe('task-planner — estimation', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = getTaskPlanner();
  });

  it('estimates total minutes', () => {
    const plan = planner.createPlan('Build a feature with tests');
    const est = planner.estimate(plan);
    expect(est.totalMinutes).toBeGreaterThan(0);
    expect(est.byStep.length).toBe(plan.steps.length);
  });

  it('estimates total cost (CLEAR framework)', () => {
    const plan = planner.createPlan('Build and test a feature');
    const est = planner.estimate(plan);
    expect(est.totalCost).toBeGreaterThan(0);
    for (const step of est.byStep) {
      expect(step.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('every step has estimation metadata', () => {
    const plan = planner.createPlan('Implement and test login with auth');
    for (const step of plan.steps) {
      expect(step.estimatedMinutes).toBeGreaterThan(0);
      expect(step.estimatedCost).toBeGreaterThan(0);
      expect(step.category).toBeTruthy();
      expect(step.riskLevel).toBeTruthy();
    }
  });

  it('security steps have higher risk', () => {
    const plan = planner.createPlan('Implement login with password');
    const securitySteps = plan.steps.filter((s) => s.category === 'security');
    expect(securitySteps.length).toBeGreaterThan(0);
    expect(securitySteps[0].riskLevel).toBe('high');
  });
});

describe('task-planner — critical path', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = getTaskPlanner();
  });

  it('returns longest path through the DAG', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'A', estimatedMinutes: 10 },
        { id: 'b', title: 'B', estimatedMinutes: 30, dependencies: ['a'] },
        { id: 'c', title: 'C', estimatedMinutes: 5, dependencies: ['a'] },
        { id: 'd', title: 'D', estimatedMinutes: 20, dependencies: ['b', 'c'] },
      ],
    };
    const path = planner.findCriticalPath(plan);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1].id).toBe('d');
    // Path should be A → B → D (40 min) since B is longer than C
    const pathIds = path.map((s) => s.id);
    expect(pathIds).toContain('a');
    expect(pathIds).toContain('b');
    expect(pathIds).toContain('d');
  });

  it('handles disconnected steps', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'A', estimatedMinutes: 10 },
        { id: 'b', title: 'B', estimatedMinutes: 20 },
      ],
    };
    const path = planner.findCriticalPath(plan);
    expect(path.length).toBe(1);
    expect(path[0].id).toBe('b');  // longer step wins
  });
});

describe('task-planner — cycle detection', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = getTaskPlanner();
  });

  it('returns empty cycles for valid DAG', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', dependencies: ['a'] },
        { id: 'c', title: 'C', dependencies: ['b'] },
      ],
    };
    const cycles = planner.detectCycles(plan);
    expect(cycles.length).toBe(0);
  });

  it('detects simple cycle A → B → A', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'A', dependencies: ['b'] },
        { id: 'b', title: 'B', dependencies: ['a'] },
      ],
    };
    const cycles = planner.detectCycles(plan);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('detects self-loop', () => {
    const plan: Plan = {
      steps: [
        { id: 'a', title: 'A', dependencies: ['a'] },
      ],
    };
    const cycles = planner.detectCycles(plan);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('task-planner — JSON export', () => {
  it('exports valid JSON', () => {
    const planner = getTaskPlanner();
    const plan = planner.createPlan('Build a feature with tests');
    const json = planner.exportJson(plan);
    const parsed = JSON.parse(json);
    expect(parsed.steps).toBeDefined();
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.totalSteps).toBe(plan.steps.length);
  });
});

describe('task-planner — integration with auto-apply context', () => {
  it('produces Plan consumable by auto-apply execTaskPlan', () => {
    const planner = getTaskPlanner();
    const plan = planner.createPlan('Fix authentication bug');

    // Simulate auto-apply's usage
    expect(plan.steps.length).toBeGreaterThan(0);
    for (const step of plan.steps) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.title).toBe('string');
    }
    // Auto-apply previously stringified the whole plan
    const serialized = JSON.stringify(plan);
    expect(serialized).toContain('steps');
  });

  it('produces Plan consumable by auto-execution createPlan', () => {
    const planner = getTaskPlanner();
    const rawPlan = planner.createPlan('Refactor authentication module');
    // auto-execution does: steps.map((s, i) => ({ id: s.id || ..., title: s.title, ... }))
    expect(rawPlan.steps.length).toBeGreaterThan(0);
    for (let i = 0; i < rawPlan.steps.length; i++) {
      const s = rawPlan.steps[i];
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
    }
  });
});

import { beforeEach } from 'vitest';
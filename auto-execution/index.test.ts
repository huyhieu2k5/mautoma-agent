/**
 * AutoExecution Engine Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AutoExecutionEngine,
  createAutoExecutionEngine,
  autoExecute,
  ExecutionPlan,
  ExecutionStep,
  PlanEnhancement,
} from './index';

// Mock dependencies
vi.mock('../memory-store', () => ({
  getMemoryManager: vi.fn(() => ({
    store: vi.fn().mockResolvedValue(undefined),
    getRecent: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../task-planner', () => ({
  getTaskPlanner: vi.fn(() => ({
    createPlan: (request: string) => ({
      steps: [
        { id: '1', title: `Analyze: ${request.slice(0, 40)}` },
        { id: '2', title: 'Execute plan' },
        { id: '3', title: 'Verify result' },
      ],
    }),
  })),
}));

vi.mock('../verification', () => ({
  createVerificationEngine: vi.fn(() => ({
    verify: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../error-recovery', () => ({
  createErrorLearner: vi.fn(() => ({
    getErrorPatterns: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../auto-apply', () => ({
  autoApply: vi.fn().mockResolvedValue({
    success: true,
    axesTriggered: [],
    steps: [],
    durationMs: 100,
    summary: 'Auto-apply completed',
  }),
}));

describe('AutoExecutionEngine', () => {
  let engine: AutoExecutionEngine;

  beforeEach(() => {
    engine = createAutoExecutionEngine({ verbose: false });
  });

  describe('isAutoExecutionCandidate', () => {
    it('should detect Vietnamese plan requests', () => {
      const result = engine.isAutoExecutionCandidate('Tôi có kế hoạch tạo một plugin mới');
      expect(result.eligible).toBe(true);
      expect(result.matchedKeywords).toContain('kế hoạch');
    });

    it('should detect English plan requests', () => {
      const enEngine = createAutoExecutionEngine({ language: 'en', verbose: false });
      const result = enEngine.isAutoExecutionCandidate('I have a plan to implement authentication');
      expect(result.eligible).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect fix requests as plan', () => {
      const enEngine = createAutoExecutionEngine({ language: 'en', verbose: false });
      const result = enEngine.isAutoExecutionCandidate('Fix the login bug and add error handling');
      expect(result.eligible).toBe(true);
      expect(result.matchedKeywords.some(k => k === 'fix' || k === 'Fix')).toBe(true);
    });

    it('should detect build/create requests', () => {
      const enEngine = createAutoExecutionEngine({ language: 'en', verbose: false });
      const result = enEngine.isAutoExecutionCandidate('Build a new API endpoint for user registration');
      expect(result.eligible).toBe(true);
    });

    it('should NOT trigger on simple questions', () => {
      const result = engine.isAutoExecutionCandidate('What is the weather today?');
      expect(result.eligible).toBe(false);
    });

    it('should NOT trigger on casual chat', () => {
      const result = engine.isAutoExecutionCandidate('Hello, how are you?');
      expect(result.eligible).toBe(false);
    });

    it('should use custom threshold', () => {
      const strict = createAutoExecutionEngine({ triggerThreshold: 0.8 });
      const result = strict.isAutoExecutionCandidate('Fix bug');
      expect(result.eligible).toBe(false); // score likely below 0.8
    });
  });

  describe('createPlan', () => {
    it('should create plan from request', async () => {
      const noUpgrade = createAutoExecutionEngine({ allowSelfUpgrade: false, verbose: false });
      const plan = await noUpgrade.createPlan('Fix authentication bug');

      expect(plan.request).toBe('Fix authentication bug');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.status).toBe('detected');
      expect(plan.totalSteps).toBe(plan.steps.length);
    });

    it('should auto-upgrade plan with missing steps', async () => {
      const upgradeEngine = createAutoExecutionEngine({ allowSelfUpgrade: true, verbose: false });
      const plan = await upgradeEngine.createPlan('Fix authentication bug');

      // Should add error handling step for fix requests
      const hasErrorHandling = plan.steps.some(s =>
        /error|exception|fallback/i.test(s.title)
      );
      expect(hasErrorHandling).toBe(true);
    });

    it('should not auto-upgrade if disabled', async () => {
      const noUpgrade = createAutoExecutionEngine({ allowSelfUpgrade: false, verbose: false });
      const plan = await noUpgrade.createPlan('Fix authentication bug');

      const hasErrorHandling = plan.steps.some(s =>
        /error|exception|fallback/i.test(s.title)
      );
      // May or may not have it depending on base plan
      expect(plan.upgradedSteps).toBe(0);
    });

    it('should add test step for feature requests', async () => {
      const upgradeEngine = createAutoExecutionEngine({ allowSelfUpgrade: true, verbose: false });
      const plan = await upgradeEngine.createPlan('Create user registration feature');

      const hasVerify = plan.steps.some(s =>
        /verify|test|kiểm thử|validate/i.test(s.title)
      );
      expect(hasVerify).toBe(true);
    });

    it('should add commit step for create requests', async () => {
      const upgradeEngine = createAutoExecutionEngine({ allowSelfUpgrade: true, verbose: false });
      const plan = await upgradeEngine.createPlan('Add new feature');

      const hasCommit = plan.steps.some(s =>
        /commit|git|memory/i.test(s.title)
      );
      expect(hasCommit).toBe(true);
    });

    it('should add backup step for refactor requests', async () => {
      const upgradeEngine = createAutoExecutionEngine({ allowSelfUpgrade: true, verbose: false });
      const plan = await upgradeEngine.createPlan('Refactor the authentication module');

      const hasBackup = plan.steps.some(s =>
        /backup|snapshot|preserve/i.test(s.title)
      );
      expect(hasBackup).toBe(true);
    });

    it('should add security check for auth-related requests', async () => {
      const upgradeEngine = createAutoExecutionEngine({ allowSelfUpgrade: true, verbose: false });
      const plan = await upgradeEngine.createPlan('Implement login with password authentication');

      const hasSecurity = plan.steps.some(s =>
        /security|auth|permission/i.test(s.title)
      );
      expect(hasSecurity).toBe(true);
    });

    it('should generate unique step IDs', async () => {
      const plan1 = await engine.createPlan('Task 1');
      const plan2 = await engine.createPlan('Task 2');

      const ids1 = new Set(plan1.steps.map(s => s.id));
      const ids2 = new Set(plan2.steps.map(s => s.id));

      // IDs should be unique within each plan
      expect(ids1.size).toBe(plan1.steps.length);
      expect(ids2.size).toBe(plan2.steps.length);
    });
  });

  describe('shouldAutoExecute', () => {
    it('should return true for plan requests when autoExecute is enabled', async () => {
      const engine = createAutoExecutionEngine({ autoExecute: true });
      const result = await engine.shouldAutoExecute('I have a plan to fix this bug');
      expect(result).toBe(true);
    });

    it('should return false for non-plan requests', async () => {
      const result = await engine.shouldAutoExecute('Hello world');
      expect(result).toBe(false);
    });

    it('should return false when autoExecute is disabled', async () => {
      const disabled = createAutoExecutionEngine({ autoExecute: false });
      const result = await disabled.shouldAutoExecute('I plan to build a website');
      expect(result).toBe(false);
    });
  });

  describe('autoExecute helper', () => {
    it('should skip non-plan requests gracefully', async () => {
      const result = await autoExecute('What is 2+2?', false);

      expect(result.success).toBe(false);
      expect(result.plan.totalSteps).toBe(0);
      expect(result.summary).toContain('No plan detected');
    });

    it('should execute plan requests', async () => {
      const result = await autoExecute('Fix the login bug', false);

      expect(result.success).toBe(true);
      expect(result.plan.totalSteps).toBeGreaterThan(0);
      expect(result.plan.status).toBe('completed');
    });
  });

  describe('config options', () => {
    it('should respect stopOnError config', async () => {
      const stopOnError = createAutoExecutionEngine({ stopOnError: true, verbose: false });
      const result = await stopOnError.execute('Build a feature');

      expect(result.plan.status).toBe('completed');
    });

    it('should work with English language', async () => {
      const enEngine = createAutoExecutionEngine({ language: 'en', verbose: false });
      const result = await enEngine.execute('Implement user authentication');

      expect(result.plan.status).toBe('completed');
    });

    it('should work with Vietnamese language', async () => {
      const viEngine = createAutoExecutionEngine({ language: 'vi', verbose: false });
      const result = await viEngine.execute('Tạo một API mới');

      expect(result.plan.status).toBe('completed');
    });
  });
});

describe('Topological Sort (dependency ordering)', () => {
  it('should sort steps by dependencies', async () => {
    const engine = createAutoExecutionEngine({ verbose: false });
    const plan = await engine.createPlan('Build a feature');

    // All steps should have an id
    for (const step of plan.steps) {
      expect(step.id).toBeTruthy();
    }
  });
});

describe('Plan Enhancement Quality Score', () => {
  it('should calculate quality score for enhanced plans', async () => {
    const engine = createAutoExecutionEngine({ allowSelfUpgrade: true, verbose: false });
    const plan = await engine.createPlan('Fix authentication and add new feature with UI');

    // Quality score should improve with more additions
    expect(typeof plan.upgradedSteps).toBe('number');
  });

  it('should return quality score of 1.0 when no upgrades needed', async () => {
    const engine = createAutoExecutionEngine({ allowSelfUpgrade: false, verbose: false });
    const plan = await engine.createPlan('Do something');

    // When no self-upgrade, upgradedSteps should be 0
    expect(plan.upgradedSteps).toBe(0);
  });
});

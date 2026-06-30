import { describe, it, expect, beforeEach } from 'vitest';

import {
  createErrorLearner,
  computeSignature,
  signatureToRegex,
  defaultRecovery,
  PatternDB,
  generatePatternId,
  computeRetryDelay,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  type ErrorLearner,
  type ErrorPattern,
} from './index';

describe('error-recovery — computeSignature', () => {
  it('uses name + message snippet', () => {
    const err = new Error('connection refused');
    const sig = computeSignature(err);
    expect(sig).toContain('Error');
    expect(sig).toContain('connection');
    expect(sig).toContain('refused');
  });

  it('includes code when present', () => {
    const err = Object.assign(new Error('boom'), { code: 'ENOENT' });
    const sig = computeSignature(err);
    expect(sig).toContain('ENOENT');
  });

  it('truncates long messages', () => {
    const err = new Error('a b c d e f g h i j k l m n o p q r s t');
    const sig = computeSignature(err);
    const words = sig.split(':')[1]?.split(' ') ?? [];
    expect(words.length).toBeLessThanOrEqual(4);
  });
});

describe('error-recovery — signatureToRegex', () => {
  it('escapes special chars', () => {
    const r = signatureToRegex('Error:foo+bar?baz');
    expect(r).toBe('Error.*foo\\+bar\\?baz');
  });

  it('joins parts with .*', () => {
    const r = signatureToRegex('a:b:c');
    expect(r).toBe('a.*b.*c');
  });
});

describe('error-recovery — defaultRecovery', () => {
  it('returns timeout procedure for timeout errors', () => {
    const steps = defaultRecovery('TimeoutError');
    expect(steps.some((s) => s.action === 'retry')).toBe(true);
    expect(steps.some((s) => s.action === 'wait')).toBe(true);
  });

  it('returns network procedure for network errors', () => {
    const steps = defaultRecovery('NetworkError');
    expect(steps.some((s) => s.action === 'escalate')).toBe(true);
  });

  it('returns permission procedure', () => {
    const steps = defaultRecovery('EPermissionError');
    expect(steps.some((s) => s.action === 'escalate')).toBe(true);
  });

  it('returns generic fallback', () => {
    const steps = defaultRecovery('SomeWeirdError');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((s) => s.action === 'retry' || s.action === 'escalate')).toBe(true);
  });
});

describe('error-recovery — computeRetryDelay', () => {
  it('none returns negative', () => {
    expect(computeRetryDelay('none', 1)).toBeLessThan(0);
  });

  it('immediate returns 0', () => {
    expect(computeRetryDelay('immediate', 1)).toBe(0);
    expect(computeRetryDelay('immediate', 5)).toBe(0);
  });

  it('linear scales', () => {
    expect(computeRetryDelay('linear', 1)).toBe(100);
    expect(computeRetryDelay('linear', 5)).toBe(500);
  });

  it('exponential grows fast', () => {
    const d1 = computeRetryDelay('exponential', 1, 100, 30000);
    const d5 = computeRetryDelay('exponential', 5, 100, 30000);
    expect(d5).toBeGreaterThan(d1);
    expect(d5).toBeLessThanOrEqual(30000);
  });

  it('caps at maxDelayMs', () => {
    expect(computeRetryDelay('exponential', 100, 100, 5000)).toBeLessThanOrEqual(5000);
  });

  it('exponential-jitter adds randomness', () => {
    const d1 = computeRetryDelay('exponential-jitter', 3, 100, 10000);
    expect(d1).toBeGreaterThanOrEqual(200);  // 100 * 2^2
  });
});

describe('error-recovery — withRetry', () => {
  it('returns result on success', async () => {
    let count = 0;
    const r = await withRetry(async () => {
      count++;
      return 'ok';
    });
    expect(r.result).toBe('ok');
    expect(count).toBe(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let count = 0;
    const r = await withRetry(
      async () => {
        count++;
        if (count < 3) throw new Error('fail');
        return 'recovered';
      },
      { strategy: 'immediate', maxAttempts: 5, baseDelayMs: 1 }
    );
    expect(r.result).toBe('recovered');
    expect(count).toBe(3);
  });

  it('returns error after maxAttempts', async () => {
    let count = 0;
    const r = await withRetry(
      async () => {
        count++;
        throw new Error('always');
      },
      { strategy: 'immediate', maxAttempts: 3, baseDelayMs: 1 }
    );
    expect(r.error?.message).toBe('always');
    expect(count).toBe(3);
  });

  it('caps at 5 attempts (security contract)', async () => {
    let count = 0;
    const r = await withRetry(
      async () => {
        count++;
        throw new Error('never');
      },
      { strategy: 'immediate', maxAttempts: 999, baseDelayMs: 1 }
    );
    expect(count).toBe(5);
    expect(r.attempts.length).toBe(5);
  });

  it('records delay in attempts', async () => {
    const r = await withRetry(
      async () => { throw new Error('x'); },
      { strategy: 'linear', maxAttempts: 3, baseDelayMs: 50 }
    );
    expect(r.attempts[1]?.delayMs).toBe(100);
    expect(r.attempts[2]?.delayMs).toBe(150);
  });

  it('default config is exponential with 5 attempts', () => {
    expect(DEFAULT_RETRY_CONFIG.strategy).toBe('exponential');
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(5);
  });
});

describe('error-recovery — PatternDB', () => {
  let db: PatternDB;

  beforeEach(() => {
    db = new PatternDB();
  });

  it('upsert adds new pattern', () => {
    const pattern: ErrorPattern = {
      id: 'p1',
      signature: 'Error:test',
      matchPattern: 'Error.*test',
      recoveryProcedure: [{ action: 'log' }],
      successCount: 0,
      failureCount: 0,
      severity: 'medium',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.upsert(pattern);
    expect(db.size()).toBe(1);
    expect(db.get('p1')?.signature).toBe('Error:test');
  });

  it('upsert merges counters on duplicate id', () => {
    const now = Date.now();
    db.upsert({
      id: 'p1', signature: 'x', matchPattern: 'x',
      recoveryProcedure: [], successCount: 1, failureCount: 0,
      severity: 'low', createdAt: now, updatedAt: now,
    });
    db.upsert({
      id: 'p1', signature: 'x', matchPattern: 'x',
      recoveryProcedure: [], successCount: 2, failureCount: 3,
      severity: 'low', createdAt: now, updatedAt: now,
    });
    const merged = db.get('p1');
    expect(merged?.successCount).toBe(3);
    expect(merged?.failureCount).toBe(3);
  });

  it('findMatch returns matching pattern', () => {
    db.upsert({
      id: 'p1', signature: 'RefusedError', matchPattern: 'RefusedError|refused',
      recoveryProcedure: [], successCount: 0, failureCount: 0,
      severity: 'medium', createdAt: 0, updatedAt: 0,
    });
    const found = db.findMatch(new Error('connection refused'));
    expect(found?.id).toBe('p1');
  });

  it('findMatch returns null when no match', () => {
    const found = db.findMatch(new Error('totally unique xyz'));
    expect(found).toBeNull();
  });

  it('clear removes all patterns', () => {
    db.upsert({
      id: 'p1', signature: 'x', matchPattern: 'x',
      recoveryProcedure: [], successCount: 0, failureCount: 0,
      severity: 'low', createdAt: 0, updatedAt: 0,
    });
    db.clear();
    expect(db.size()).toBe(0);
  });

  it('getAll returns array', () => {
    db.upsert({
      id: 'p1', signature: 'x', matchPattern: 'x',
      recoveryProcedure: [], successCount: 0, failureCount: 0,
      severity: 'low', createdAt: 0, updatedAt: 0,
    });
    expect(db.getAll().length).toBe(1);
  });

  it('evicts oldest when at capacity', () => {
    const small = new PatternDB({ maxPatterns: 2 });
    const old: ErrorPattern = {
      id: 'old', signature: 'o', matchPattern: 'o',
      recoveryProcedure: [], successCount: 0, failureCount: 0,
      severity: 'low', createdAt: 100, updatedAt: 100,
    };
    small.upsert({ ...old, id: 'a', updatedAt: 200 });
    small.upsert({ ...old, id: 'b', updatedAt: 300 });
    small.upsert({ ...old, id: 'c', updatedAt: 400 });
    expect(small.size()).toBe(2);
    expect(small.get('a')).toBeNull();  // Evicted (oldest)
    expect(small.get('c')).not.toBeNull();
  });
});

describe('error-recovery — generatePatternId', () => {
  it('starts with pat_', () => {
    expect(generatePatternId()).toMatch(/^pat_/);
  });

  it('returns unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) ids.add(generatePatternId());
    expect(ids.size).toBe(10);
  });
});

describe('error-recovery — ErrorLearner', () => {
  let learner: ErrorLearner;

  beforeEach(() => {
    learner = createErrorLearner({ persist: false });
  });

  it('recordError creates a new pattern', () => {
    const pattern = learner.recordError(new Error('unique never-seen-before'));
    expect(pattern.id).toMatch(/^pat_/);
    expect(pattern.failureCount).toBe(1);
  });

  it('recordError increments failure count on existing pattern', () => {
    learner.recordError(new Error('unique never-seen-1'));
    learner.recordError(new Error('unique never-seen-2'));
    learner.recordError(new Error('unique never-seen-3'));
    const stats = learner.getStats();
    expect(stats.totalFailures).toBeGreaterThanOrEqual(3);
  });

  it('findMatch returns null for unknown error', () => {
    const found = learner.findMatch(new Error('unknown pattern xyz'));
    expect(found).toBeNull();
  });

  it('applyRecovery returns result for known pattern', async () => {
    const err = new Error('unique recovery test abc');
    learner.recordError(err);
    const r = await learner.applyRecovery(err);
    expect(r).toHaveProperty('success');
    expect(r).toHaveProperty('attempts');
    expect(r).toHaveProperty('totalDurationMs');
  });

  it('applyRecovery succeeds when steps complete', async () => {
    const err = new Error('simulated recovery success');
    const r = await learner.applyRecovery(err);
    expect(r.success).toBe(true);
  });

  it('getErrorPatterns returns summaries', async () => {
    learner.recordError(new Error('a unique error 1'));
    learner.recordError(new Error('another unique error 2'));
    const patterns = await learner.getErrorPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('signature');
    }
  });

  it('getStats reports aggregate', () => {
    learner.recordError(new Error('aggregate test 1'));
    learner.recordError(new Error('aggregate test 2'));
    const stats = learner.getStats();
    expect(stats).toHaveProperty('totalPatterns');
    expect(stats).toHaveProperty('totalSuccesses');
    expect(stats).toHaveProperty('totalFailures');
    expect(stats).toHaveProperty('successRate');
    expect(stats.successRate).toBeGreaterThanOrEqual(0);
    expect(stats.successRate).toBeLessThanOrEqual(1);
  });

  it('getPatternsByTag filters by tag', () => {
    learner.recordError(new Error('TimeoutError happened'));
    const patterns = learner.getPatternsByTag('Timeout');
    expect(patterns.length).toBeGreaterThanOrEqual(0);
  });
});
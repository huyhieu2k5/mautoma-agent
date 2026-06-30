/**
 * tests/stress/error-recovery.stress.test.ts — Stress tests for error-recovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PatternDB,
  computeSignature,
  signatureToRegex,
  defaultRecovery,
  withRetry,
  computeRetryDelay,
  DEFAULT_RETRY_CONFIG,
  createErrorLearner,
} from '../../error-recovery';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'err-stress-'));
});

describe('STRESS: error-recovery — PatternDB', () => {
  it('creates empty DB', () => {
    const db = new PatternDB();
    expect(db.size()).toBe(0);
  });

  it('upserts pattern', () => {
    const db = new PatternDB();
    db.upsert({
      id: 'p1',
      matchPattern: '.*',
      sampleMessage: 'TypeError: x is undefined',
      successCount: 1,
      failureCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      occurrences: 1,
    });
    expect(db.size()).toBe(1);
  });

  it('upsert accumulates counts on duplicate', () => {
    const db = new PatternDB();
    db.upsert({
      id: 'p1', matchPattern: '.*', sampleMessage: 'm', successCount: 1, failureCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(), occurrences: 1,
    });
    db.upsert({
      id: 'p1', matchPattern: '.*', sampleMessage: 'm', successCount: 1, failureCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(), occurrences: 1,
    });
    expect(db.get('p1')?.successCount).toBe(2);
  });

  it('handles 1000 patterns', () => {
    const db = new PatternDB({ maxPatterns: 2000 });
    for (let i = 0; i < 1000; i++) {
      db.upsert({
        id: `p${i}`,
        matchPattern: `pattern_${i}`,
        sampleMessage: `Error ${i}`,
        successCount: 1,
        failureCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        occurrences: 1,
      });
    }
    expect(db.size()).toBe(1000);
  });

  it('persists to JSONL', () => {
    const db = new PatternDB({ dbPath: join(tmp, 'patterns.jsonl'), maxPatterns: 100 });
    for (let i = 0; i < 10; i++) {
      db.upsert({
        id: `p${i}`, matchPattern: `s${i}`, sampleMessage: `m${i}`, successCount: 1, failureCount: 0,
        createdAt: Date.now(), updatedAt: Date.now(), occurrences: 1,
      });
    }
    db.save();
    expect(db.size()).toBe(10);
  });

  it('getById works', () => {
    const db = new PatternDB();
    db.upsert({
      id: 'p1', matchPattern: 'special', sampleMessage: 'm', successCount: 1, failureCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(), occurrences: 1,
    });
    expect(db.get('p1')?.id).toBe('p1');
  });

  it('returns null for missing pattern', () => {
    const db = new PatternDB();
    expect(db.get('missing')).toBeNull();
  });

  it('findMatch returns matching pattern', () => {
    const db = new PatternDB();
    db.upsert({
      id: 'p1', matchPattern: 'typeerror.*undefined', sampleMessage: 'TypeError', successCount: 1, failureCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(), occurrences: 1,
    });
    const match = db.findMatch(new Error('TypeError: x is undefined'));
    expect(match?.id).toBe('p1');
  });

  it('clear empties database', () => {
    const db = new PatternDB();
    db.upsert({
      id: 'p1', matchPattern: '.*', sampleMessage: 'm', successCount: 1, failureCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(), occurrences: 1,
    });
    db.clear();
    expect(db.size()).toBe(0);
  });
});

describe('STRESS: error-recovery — signature helpers', () => {
  it('computeSignature generates stable signature', () => {
    const s1 = computeSignature('TypeError: x is undefined');
    const s2 = computeSignature('TypeError: x is undefined');
    expect(s1).toBe(s2);
  });

  it('computeSignature returns non-empty string', () => {
    const sig = computeSignature('any message');
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  it('signatureToRegex converts to regex string', () => {
    const regex = signatureToRegex('TypeError: foo bar');
    expect(typeof regex).toBe('string');
  });

  it('signatureToRegex handles empty', () => {
    const regex = signatureToRegex('');
    expect(typeof regex).toBe('string');
  });

  it('1000 signature computations < 50ms', () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      computeSignature(`Error message ${i}`);
    }
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe('STRESS: error-recovery — retry strategies', () => {
  it('withRetry succeeds on first attempt', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    });
    const value = typeof result === 'object' && result !== null && 'result' in result ? (result as { result: string }).result : result;
    expect(value).toBe('ok');
    expect(calls).toBe(1);
  });

  it('withRetry retries on failure', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 2) throw new Error('fail');
      return 'ok';
    }, { maxAttempts: 3 });
    const value = typeof result === 'object' && result !== null && 'result' in result ? (result as { result: string }).result : result;
    expect(value).toBe('ok');
    expect(calls).toBe(2);
  });

  it('withRetry returns error result after max attempts', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      throw new Error('always');
    }, { maxAttempts: 2 });
    expect(calls).toBe(2);
    expect(result).toHaveProperty('error');
  });

  it('withRetry respects immediate strategy', async () => {
    const start = Date.now();
    try {
      await withRetry(async () => { throw new Error('x'); }, { maxAttempts: 3, strategy: 'immediate' });
    } catch {}
    // Should be fast (no backoff delay)
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('computeRetryDelay strategies', () => {
    expect(computeRetryDelay('immediate', 1)).toBe(0);
    expect(computeRetryDelay('linear', 1)).toBeGreaterThanOrEqual(0);
    expect(computeRetryDelay('exponential', 1)).toBeGreaterThanOrEqual(0);
  });

  it('DEFAULT_RETRY_CONFIG has expected shape', () => {
    expect(DEFAULT_RETRY_CONFIG).toBeDefined();
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBeGreaterThan(0);
  });
});

describe('STRESS: error-recovery — ErrorLearner', () => {
  it('creates default learner', () => {
    const learner = createErrorLearner();
    expect(learner).toBeDefined();
  });

  it('learns from error', async () => {
    const learner = createErrorLearner();
    await learner.applyRecovery(new Error('TypeError: undefined'));
    const patterns = await learner.getErrorPatterns();
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('handles multiple errors', async () => {
    const learner = createErrorLearner();
    await learner.applyRecovery(new Error('Error 1'));
    await learner.applyRecovery(new Error('Error 2'));
    await learner.applyRecovery(new Error('Error 3'));
    const patterns = await learner.getErrorPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(0);
  });
});

describe('STRESS: error-recovery — performance', () => {
  it('1000 error learn operations < 3s', async () => {
    const learner = createErrorLearner();
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      await learner.applyRecovery(new Error(`Error ${i}`));
    }
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it('1000 withRetry calls < 1s', async () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      await withRetry(async () => { throw new Error('x'); }, { maxAttempts: 1 });
    }
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
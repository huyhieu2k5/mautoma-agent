import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createVerificationEngine,
  VerificationEngine,
  quickVerify,
} from './index';
import { latsSearch } from './lats_tree_search';
import { selfRAG, indexVerificationResult } from './self_rag';
import { verifyWithLoop } from './self_verifying_loop';

describe('verification — VerificationEngine (pure fast checks)', () => {
  let tmp: string;
  let engine: VerificationEngine;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'verify-test-'));
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    writeFileSync(join(tmp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020' } }));
    engine = createVerificationEngine();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('engine factory returns object with verify and runAllChecks', () => {
    expect(engine).toBeDefined();
    expect(typeof engine.verify).toBe('function');
    expect(typeof engine.runAllChecks).toBe('function');
  });

  it('quickVerify runs fast checks only (no subprocess)', async () => {
    const start = Date.now();
    const r = await quickVerify({ workspaceRoot: tmp });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);  // Fast = under 1s
    expect(r).toHaveProperty('ok');
    expect(r).toHaveProperty('checks');
  });

  it('result has required shape', async () => {
    const r = await quickVerify({ workspaceRoot: tmp });
    expect(r).toHaveProperty('ok');
    expect(r).toHaveProperty('checks');
    expect(r).toHaveProperty('totalDurationMs');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('score');
    expect(Array.isArray(r.checks)).toBe(true);
  });

  it('score is in [0, 1]', async () => {
    const r = await quickVerify({ workspaceRoot: tmp });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('File Structure check passes when key files exist', async () => {
    const r = await quickVerify({ workspaceRoot: tmp });
    const check = r.checks.find((c) => c.name === 'File Structure');
    expect(check).toBeDefined();
    expect(check?.status).toBe('pass');
  });

  it('Package JSON check validates package.json', async () => {
    const r = await quickVerify({ workspaceRoot: tmp });
    const check = r.checks.find((c) => c.name === 'Package JSON');
    expect(check).toBeDefined();
    expect(check?.status).toBe('pass');
  });

  it('TypeScript Config check validates tsconfig', async () => {
    const r = await quickVerify({ workspaceRoot: tmp });
    const check = r.checks.find((c) => c.name === 'TypeScript Config');
    expect(check).toBeDefined();
    expect(check?.status).toBe('pass');
  });

  it('skipped checks return status=skip', async () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), 'empty-'));
    try {
      const r = await quickVerify({ workspaceRoot: emptyTmp });
      const tsCheck = r.checks.find((c) => c.name === 'TypeScript Config');
      expect(tsCheck?.status).toBe('skip');
      const pkgCheck = r.checks.find((c) => c.name === 'Package JSON');
      expect(pkgCheck?.status).toBe('skip');
    } finally {
      rmSync(emptyTmp, { recursive: true, force: true });
    }
  });

  it('does NOT run TypeScript compile by default (fast mode)', async () => {
    const r = await quickVerify({ workspaceRoot: tmp });
    const heavyCheck = r.checks.find((c) => c.name === 'TypeScript Compile');
    expect(heavyCheck).toBeUndefined();
  });

  it('does NOT run tests by default (fast mode)', async () => {
    const r = await quickVerify({ workspaceRoot: tmp });
    const testCheck = r.checks.find((c) => c.name === 'Tests');
    expect(testCheck).toBeUndefined();
  });
});

describe('verification — latsTreeSearch (pure logic)', () => {
  it('returns LATSSearchResult shape', () => {
    const r = latsSearch({ maxDepth: 2, maxNodes: 5 });
    expect(r).toHaveProperty('bestAction');
    expect(r).toHaveProperty('tree');
    expect(r).toHaveProperty('totalNodes');
    expect(r).toHaveProperty('searchDepth');
    expect(r).toHaveProperty('durationMs');
    expect(r).toHaveProperty('verified');
  });

  it('tree is a Map', () => {
    const r = latsSearch({ maxDepth: 2, maxNodes: 5 });
    expect(r.tree).toBeInstanceOf(Map);
  });

  it('tree has root node', () => {
    const r = latsSearch({ maxDepth: 2, maxNodes: 10 });
    const root = r.tree.get(r.rootId);
    expect(root).toBeDefined();
    expect(root?.action).toBe('root');
  });

  it('totalNodes is at least 1 (root)', () => {
    const r = latsSearch({ maxDepth: 2, maxNodes: 10 });
    expect(r.totalNodes).toBeGreaterThanOrEqual(1);
  });

  it('runs fast (<500ms)', () => {
    const start = Date.now();
    latsSearch({ maxDepth: 2, maxNodes: 5 });
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('verification — committeeReview (skipScan mode default)', () => {
  // Lazy import — committee_review only loaded if these tests run
  let committeeReviewFn: typeof import('./committee_review').committeeReview;

  beforeEach(async () => {
    if (!committeeReviewFn) {
      const mod = await import('./committee_review');
      committeeReviewFn = mod.committeeReview;
    }
  });

  it('returns CommitteeReviewResult shape', () => {
    const r = committeeReviewFn();
    expect(r).toHaveProperty('verdict');
    expect(r).toHaveProperty('consensus');
    expect(r).toHaveProperty('votes');
    expect(r).toHaveProperty('findings');
    expect(r).toHaveProperty('perspectives');
    expect(r).toHaveProperty('durationMs');
  });

  it('runs fast (<2s in skipScan mode)', () => {
    const start = Date.now();
    committeeReviewFn();
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('verdict is pass/warn/fail', () => {
    const r = committeeReviewFn();
    expect(['pass', 'warn', 'fail']).toContain(r.verdict);
  });

  it('consensus is between 0 and 1', () => {
    const r = committeeReviewFn();
    expect(r.consensus).toBeGreaterThanOrEqual(0);
    expect(r.consensus).toBeLessThanOrEqual(1);
  });

  it('uses default perspectives when none provided', () => {
    const r = committeeReviewFn();
    expect(r.perspectives).toEqual(['correctness', 'security', 'readability']);
    expect(r.votes.length).toBe(3);
  });

  it('accepts custom perspectives', () => {
    const r = committeeReviewFn({ perspectives: ['correctness'] });
    expect(r.votes.length).toBe(1);
    expect(r.perspectives).toEqual(['correctness']);
  });
});

describe('verification — selfRAG (pure logic, tmp file)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rag-'));
    mkdirSync(join(tmp, '.mautoma'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns SelfRAGResult shape', () => {
    const r = selfRAG(
      { ok: true, checks: [{ name: 'TypeScript', passed: true }] },
      { indexPath: join(tmp, '.mautoma', 'rag-index.jsonl') }
    );
    expect(r).toHaveProperty('verdict');
    expect(r).toHaveProperty('confidence');
    expect(r).toHaveProperty('retrievedDocs');
    expect(r).toHaveProperty('groundedFindings');
    expect(r).toHaveProperty('retrievalTimeMs');
  });

  it('verdict is pass/warn/fail', () => {
    const r = selfRAG(
      { ok: true, checks: [{ name: 'TypeScript', passed: true }] },
      { indexPath: join(tmp, '.mautoma', 'rag-index.jsonl') }
    );
    expect(['pass', 'warn', 'fail']).toContain(r.verdict);
  });

  it('confidence is in [0, 1]', () => {
    const r = selfRAG(
      { ok: true, checks: [{ name: 'TypeScript', passed: true }] },
      { indexPath: join(tmp, '.mautoma', 'rag-index.jsonl') }
    );
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('indexVerificationResult persists to file', () => {
    expect(() => {
      indexVerificationResult(
        { ok: true, checks: [{ name: 'TypeScript', passed: true }] },
        { indexPath: join(tmp, '.mautoma', 'rag-index.jsonl') }
      );
    }).not.toThrow();
  });
});

describe('verification — selfVerifyingLoop', () => {
  it('returns VerifyLoopResult shape', async () => {
    const r = await verifyWithLoop({ maxIterations: 2 });
    expect(r).toHaveProperty('finalResult');
    expect(r).toHaveProperty('iterations');
    expect(r).toHaveProperty('converged');
    expect(r).toHaveProperty('attempts');
  });

  it('runs at most maxIterations', async () => {
    const r = await verifyWithLoop({ maxIterations: 3 });
    expect(r.iterations).toBeLessThanOrEqual(3);
  });

  it('attempts array has correct length', async () => {
    const r = await verifyWithLoop({ maxIterations: 2 });
    expect(r.attempts.length).toBeGreaterThanOrEqual(1);
    expect(r.attempts.length).toBeLessThanOrEqual(2);
  });

  it('converged is boolean', async () => {
    const r = await verifyWithLoop({ maxIterations: 1 });
    expect(typeof r.converged).toBe('boolean');
  });
});
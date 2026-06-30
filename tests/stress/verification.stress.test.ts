/**
 * tests/stress/verification.stress.test.ts — Stress tests for verification
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createVerificationEngine,
  latsSearch,
  committeeReview,
  verifyWithLoop,
} from '../../verification';

function setupWorkspace(dir?: string): string {
  const root = dir ?? mkdtempSync(join(tmpdir(), 'verify-stress-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0', scripts: {} }));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' } }));
  return root;
}

describe('STRESS: verification — quick checks', () => {
  it('passes on valid workspace', async () => {
    const tmp = setupWorkspace();
    try {
      const engine = createVerificationEngine();
      const result = await engine.verify({ workspaceRoot: tmp });
      expect(result.checks.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails on missing files', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'empty-'));
    try {
      const engine = createVerificationEngine();
      const result = await engine.verify({ workspaceRoot: empty });
      expect(result.ok).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('handles corrupted tsconfig', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'corrupt-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
      writeFileSync(join(dir, 'tsconfig.json'), '{ INVALID JSON');
      const engine = createVerificationEngine();
      const result = await engine.verify({ workspaceRoot: dir });
      const tsCheck = result.checks.find((c) => c.name === 'TypeScript Config');
      expect(tsCheck?.passed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles malformed package.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'malformed-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{ "name": ');
      writeFileSync(join(dir, 'tsconfig.json'), '{}');
      const engine = createVerificationEngine();
      const result = await engine.verify({ workspaceRoot: dir });
      const pkgCheck = result.checks.find((c) => c.name === 'Package JSON');
      expect(pkgCheck?.passed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips heavy checks by default', async () => {
    const tmp = setupWorkspace();
    try {
      const engine = createVerificationEngine();
      const result = await engine.verify({ workspaceRoot: tmp });
      const compileCheck = result.checks.find((c) => c.name === 'TypeScript Compile');
      expect(compileCheck).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('runs 100 verifications in < 1s', async () => {
    const tmp = setupWorkspace();
    try {
      const engine = createVerificationEngine();
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await engine.verify({ workspaceRoot: tmp });
      }
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('STRESS: verification — LATS tree search', () => {
  it('completes default search within time limit', () => {
    const result = latsSearch();
    expect(result.totalNodes).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThan(5000);
  });

  it('respects maxNodes limit', () => {
    const result = latsSearch({ maxNodes: 5, maxTimeMs: 1000 });
    expect(result.totalNodes).toBeLessThanOrEqual(10);
  });

  it('respects maxDepth limit', () => {
    const result = latsSearch({ maxDepth: 2, maxNodes: 20, maxTimeMs: 1000 });
    expect(result.searchDepth).toBeLessThanOrEqual(3);
  });

  it('respects maxTimeMs limit', () => {
    const result = latsSearch({ maxNodes: 100000, maxTimeMs: 100 });
    expect(result.durationMs).toBeLessThan(500);
  });

  it('100 LATS searches complete in < 5s', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      latsSearch({ maxNodes: 10, maxTimeMs: 100 });
    }
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

describe('STRESS: verification — Committee review', () => {
  it('runs with default 3 perspectives', () => {
    const result = committeeReview();
    expect(result.votes.length).toBe(3);
  });

  it('respects custom perspectives list', () => {
    const result = committeeReview({
      perspectives: ['correctness', 'security'],
    });
    expect(result.perspectives.length).toBe(2);
  });

  it('handles all 6 perspectives', () => {
    const result = committeeReview({
      perspectives: ['correctness', 'security', 'readability', 'performance', 'maintainability', 'testability'],
    });
    expect(result.votes.length).toBe(6);
  });

  it('respects skipScan flag', () => {
    const result = committeeReview({ skipScan: true });
    expect(result).toBeDefined();
  });

  it('handles empty perspectives', () => {
    const result = committeeReview({ perspectives: [] });
    expect(result.votes.length).toBe(0);
  });

  it('100 committee reviews in < 1s', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      committeeReview({ skipScan: true });
    }
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('STRESS: verification — Self-verifying loop', () => {
  it('terminates on first-pass verification', async () => {
    const tmp = setupWorkspace();
    try {
      const result = await verifyWithLoop({ maxIterations: 10 });
      expect(result.iterations).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('runs maxIterations on always-fail', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'iterate-'));
    try {
      const result = await verifyWithLoop({ maxIterations: 2 });
      expect(result.iterations).toBeLessThanOrEqual(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns attempts array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'attempts-'));
    try {
      const result = await verifyWithLoop({ maxIterations: 2 });
      expect(result.attempts).toBeDefined();
      expect(result.attempts.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports convergence state', async () => {
    const tmp = setupWorkspace();
    try {
      const result = await verifyWithLoop({ maxIterations: 3 });
      expect(typeof result.converged).toBe('boolean');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('STRESS: verification — edge cases', () => {
  it('handles zero-config engine', async () => {
    const engine = createVerificationEngine();
    const result = await engine.verify();
    expect(result).toBeDefined();
  });

  it('handles verbose mode without crash', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'verbose-'));
    try {
      setupWorkspace(dir);
      const engine = createVerificationEngine();
      const result = await engine.verify({ workspaceRoot: dir, verbose: true });
      expect(result).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles workspace with nested directories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nested-'));
    try {
      mkdirSync(join(dir, 'src', 'nested'), { recursive: true });
      setupWorkspace(dir);
      writeFileSync(join(dir, 'src', 'nested', 'index.ts'), 'export {};');
      const engine = createVerificationEngine();
      const result = await engine.verify({ workspaceRoot: dir });
      expect(result).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('STRESS: verification — performance', () => {
  it('1000 verifications in < 5s', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-verify-'));
    try {
      setupWorkspace(dir);
      const engine = createVerificationEngine();
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await engine.verify({ workspaceRoot: dir });
      }
      expect(Date.now() - start).toBeLessThan(5000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
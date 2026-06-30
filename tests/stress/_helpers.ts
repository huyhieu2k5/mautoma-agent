/**
 * tests/stress/_helpers.ts — Shared stress test infrastructure
 *
 * Used by all *.stress.test.ts files. Provides:
 *  - Fuzz inputs (long strings, unicode, special chars, nulls)
 *  - Concurrent run helper
 *  - Property-based invariants
 *  - Timing measurements
 *  - Memory snapshot (informational, not enforced)
 */

import * as crypto from 'node:crypto';

// ==================== FUZZ ====================

export function randString(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

export function unicodeString(): string {
  return '🚀🎯🌟🌈🔥💎⚡🎨🎭🎪'.repeat(20);
}

export function adversarialInputs(): string[] {
  return [
    '',
    ' ',
    '   \t\n  ',
    'a',
    'A'.repeat(10_000),
    '🚀'.repeat(1000),
    null as unknown as string,  // bypass TS
    undefined as unknown as string,
    'null\x00\x00\x00',
    '\\n\\t\\r',
    '<script>alert("xss")</script>',
    "'; DROP TABLE users; --",
    '../etc/passwd',
    '%00admin',
    `${'a'.repeat(100)}@${'b'.repeat(100)}.com`,
    '\n\r\t'.repeat(100),
    '🚀\\u0000\\uFFFF',
    JSON.stringify({ deeply: { nested: { object: 'x' } } }),
    'fix the bug with the fix',
    'test test test test',
    'build and test the new build with new tests',
    'a '.repeat(5000),
    Array.from({ length: 100 }, (_, i) => String(i)).join(' '),
  ];
}

// ==================== CONCURRENCY ====================

export async function runConcurrent<T>(
  fn: () => Promise<T> | T,
  count: number
): Promise<Array<{ ok: boolean; value?: T; error?: string; ms: number }>> {
  return Promise.all(
    Array.from({ length: count }, async () => {
      const start = Date.now();
      try {
        const value = await fn();
        return { ok: true, value, ms: Date.now() - start };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - start };
      }
    })
  );
}

// ==================== TIMING ====================

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label = 'op'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    fn()
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

// ==================== INVARIANTS ====================

export function expectValidScore(score: number, name: string): void {
  if (!Number.isFinite(score)) throw new Error(`${name}: score is ${score} (not finite)`);
  if (score < 0) throw new Error(`${name}: score ${score} < 0`);
  if (score > 1) throw new Error(`${name}: score ${score} > 1`);
}

export function expectValidProbability(p: number, name: string): void {
  if (!Number.isFinite(p)) throw new Error(`${name}: prob is ${p} (not finite)`);
  if (p < 0 || p > 1) throw new Error(`${name}: prob ${p} out of [0,1]`);
}

// ==================== STATS ====================

export function stats(arr: number[]): { min: number; max: number; avg: number; p50: number; p95: number } {
  if (arr.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    avg: arr.reduce((s, v) => s + v, 0) / arr.length,
    p50: sorted[Math.floor(sorted.length * 0.5)]!,
    p95: sorted[Math.floor(sorted.length * 0.95)]!,
  };
}
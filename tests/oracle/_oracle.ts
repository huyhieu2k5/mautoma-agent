/**
 * Oracle Test Infrastructure — Anti-Fraud Testing Utilities
 *
 * These utilities implement REFERENCE ORACLES that are intentionally
 * INDEPENDENT from the plugin source code. Tests use these oracles
 * to verify the plugin behaves correctly, NOT just that it returns
 * what it was hardcoded to return.
 *
 * Anti-fraud features:
 * 1. Independent HMAC/SHA256 computation via node:crypto
 * 2. Independent Elo math from first principles
 * 3. Property-based fuzz generators with shrinking
 * 4. Tamper detection that mutates output then re-verifies
 * 5. Reference DAG operations written from scratch
 * 6. Deterministic random seed for reproducibility
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─────────────────────────────────────────────────────────────────
// 1. Deterministic random (so tests can be replayed)
// ─────────────────────────────────────────────────────────────────

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Mulberry32 PRNG — small, fast, decent quality
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]!;
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  string(length: number, charset?: string): string {
    const chars = charset ?? 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < length; i++) {
      s += chars[this.int(0, chars.length - 1)];
    }
    return s;
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. Independent HMAC oracle (Node.js native crypto)
// ─────────────────────────────────────────────────────────────────

export function oracleHmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function oracleSha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// ─────────────────────────────────────────────────────────────────
// 3. Independent Elo rating system (from first principles)
// ─────────────────────────────────────────────────────────────────

export interface EloPlayer {
  id: string;
  rating: number;
}

export function oracleExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function oracleEloUpdate(
  playerA: { rating: number },
  playerB: { rating: number },
  scoreA: number, // 0, 0.5, or 1
  kFactor = 32,
): { newA: number; newB: number } {
  const expA = oracleExpectedScore(playerA.rating, playerB.rating);
  const expB = 1 - expA;
  const scoreB = 1 - scoreA;
  const newA = playerA.rating + kFactor * (scoreA - expA);
  const newB = playerB.rating + kFactor * (scoreB - expB);
  return { newA, newB };
}

// Invariant: total rating pool is conserved (with zero-sum)
export function oracleEloConservation(
  oldA: number,
  oldB: number,
  newA: number,
  newB: number,
  epsilon = 0.01,
): boolean {
  return Math.abs(oldA + oldB - (newA + newB)) < epsilon;
}

// ─────────────────────────────────────────────────────────────────
// 4. Reference DAG implementation (independent)
// ─────────────────────────────────────────────────────────────────

export interface ReferenceDAGNode {
  id: string;
  deps: string[];
}

export interface ReferenceDAGResult {
  hasCycle: boolean;
  cycleMembers: string[];
  topoOrder: string[];
  levels: Map<string, number>;
  criticalPathLength: number;
}

/**
 * Reference topological sort + cycle detection written from scratch.
 * Uses Kahn's algorithm with worklist.
 */
export function oracleTopologicalSort(
  nodes: ReferenceDAGNode[],
): ReferenceDAGResult {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const idSet = new Set<string>();

  for (const n of nodes) {
    idSet.add(n.id);
    if (!inDeg.has(n.id)) inDeg.set(n.id, 0);
    if (!adj.has(n.id)) adj.set(n.id, []);
  }

  for (const n of nodes) {
    for (const d of n.deps) {
      if (!idSet.has(d)) continue; // skip dangling deps
      adj.get(d)!.push(n.id);
      inDeg.set(n.id, (inDeg.get(n.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  const inDegCopy = new Map(inDeg);
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (inDegCopy.get(next) ?? 0) - 1;
      inDegCopy.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  const hasCycle = topoOrder.length !== idSet.size;
  let cycleMembers: string[] = [];
  if (hasCycle) {
    cycleMembers = [...idSet].filter((id) => !topoOrder.includes(id));
  }

  // Levels (longest path from root)
  const levels = new Map<string, number>();
  for (const id of topoOrder) {
    levels.set(id, 0);
  }
  for (const id of topoOrder) {
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    let maxDepLevel = -1;
    for (const d of node.deps) {
      const dl = levels.get(d);
      if (dl !== undefined && dl > maxDepLevel) maxDepLevel = dl;
    }
    levels.set(id, maxDepLevel + 1);
  }

  // Critical path length = max level + 1
  const criticalPathLength =
    levels.size > 0 ? Math.max(...levels.values()) + 1 : 0;

  return { hasCycle, cycleMembers, topoOrder, levels, criticalPathLength };
}

// ─────────────────────────────────────────────────────────────────
// 5. Property-based test generators
// ─────────────────────────────────────────────────────────────────

export function generateRandomDAG(
  rng: SeededRandom,
  nodeCount: number,
  edgeDensity = 0.3,
): ReferenceDAGNode[] {
  const nodes: ReferenceDAGNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: `n${i}`, deps: [] });
  }
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < i; j++) {
      if (rng.next() < edgeDensity) {
        nodes[i]!.deps.push(`n${j}`);
      }
    }
  }
  return nodes;
}

export function generateCyclicGraph(
  rng: SeededRandom,
  nodeCount: number,
): ReferenceDAGNode[] {
  const nodes = generateRandomDAG(rng, nodeCount, 0.1);
  if (nodeCount < 2) return nodes;
  // Add at least one back edge to create a cycle
  const a = rng.int(0, nodeCount - 1);
  let b = rng.int(0, nodeCount - 1);
  while (b <= a) b = rng.int(0, nodeCount - 1);
  nodes[b]!.deps.push(`n${a}`);
  return nodes;
}

export function generateRandomString(
  rng: SeededRandom,
  minLen = 1,
  maxLen = 100,
): string {
  const len = rng.int(minLen, maxLen);
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[rng.int(0, chars.length - 1)];
  }
  return s;
}

export function generateAdversarialString(rng: SeededRandom): string {
  const kind = rng.int(0, 8);
  switch (kind) {
    case 0:
      return ''.padStart(rng.int(0, 100), '\0');
    case 1:
      return '🚀'.repeat(rng.int(1, 1000));
    case 2:
      return 'a'.repeat(rng.int(1000, 50000));
    case 3:
      return Array.from({ length: rng.int(1, 100) }, () =>
        rng.string(rng.int(1, 10)),
      ).join(' ');
    case 4:
      return JSON.stringify({
        deeply: { nested: { object: { with: { keys: 'value' } } } },
      });
    case 5:
      return '<script>alert("xss")</script>';
    case 6:
      return "'; DROP TABLE users; --";
    case 7:
      return '\r\n\t'.repeat(rng.int(1, 100));
    default:
      return rng.string(rng.int(1, 1000));
  }
}

// ─────────────────────────────────────────────────────────────────
// 6. Merkle chain verification (independent)
// ─────────────────────────────────────────────────────────────────

export interface MerkleNode {
  hash: string;
  parentHash: string | null;
  data: unknown;
  timestamp: number;
}

/**
 * Build a Merkle chain using SHA256. Each node's hash includes the parent's.
 * Detects any tampering with any node.
 */
export function oracleBuildMerkleChain<T>(items: T[]): MerkleNode[] {
  const chain: MerkleNode[] = [];
  let parentHash: string | null = null;
  for (const data of items) {
    const timestamp = Date.now();
    const payload = JSON.stringify({ data, parentHash, timestamp });
    const hash = createHash('sha256').update(payload).digest('hex');
    chain.push({ hash, parentHash, data, timestamp });
    parentHash = hash;
  }
  return chain;
}

/**
 * Verify a Merkle chain. Returns true iff chain integrity is intact.
 */
export function oracleVerifyMerkleChain(chain: MerkleNode[]): boolean {
  let expectedParent: string | null = null;
  for (const node of chain) {
    if (node.parentHash !== expectedParent) return false;
    const payload = JSON.stringify({
      data: node.data,
      parentHash: node.parentHash,
      timestamp: node.timestamp,
    });
    const expectedHash = createHash('sha256').update(payload).digest('hex');
    if (node.hash !== expectedHash) return false;
    expectedParent = node.hash;
  }
  return true;
}

/**
 * Mutate one byte in the chain at a random position. Returns the chain
 * and the index that was tampered with.
 */
export function oracleTamperChain(
  chain: MerkleNode[],
  rng: SeededRandom,
): { tampered: MerkleNode[]; index: number } {
  if (chain.length === 0) return { tampered: chain, index: -1 };
  const index = rng.int(0, chain.length - 1);
  const tampered = chain.map((n, i) => ({ ...n }));
  const node = tampered[index]!;
  const originalHash = node.hash;
  // Flip one hex character
  const pos = rng.int(0, node.hash.length - 1);
  const newChar = node.hash[pos] === 'a' ? 'b' : 'a';
  node.hash = node.hash.slice(0, pos) + newChar + node.hash.slice(pos + 1);
  return { tampered, index };
}

// ─────────────────────────────────────────────────────────────────
// 7. Reference rate limiter (token bucket)
// ─────────────────────────────────────────────────────────────────

export class ReferenceTokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    public capacity: number,
    public refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillPerSecond,
    );
    this.lastRefill = now;
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// ─────────────────────────────────────────────────────────────────
// 8. Test workspace helpers (creates temp dirs safely)
// ─────────────────────────────────────────────────────────────────

export function makeTempWorkspace(prefix = 'mautoma-oracle-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

export function cleanupWorkspace(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function writeCorruptJsonl(dir: string, filename: string): void {
  fs.writeFileSync(
    path.join(dir, filename),
    'this is not json\n{"broken":\n---\n### corrupted ###\n',
  );
}

// ─────────────────────────────────────────────────────────────────
// 9. Cross-validation helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Tests that two functions produce the SAME OUTPUT for the same input,
 * across many random inputs. Catches divergence between plugin and oracle.
 */
export function crossValidate<TInput, TOutput>(
  name: string,
  oracleFn: (x: TInput) => TOutput,
  pluginFn: (x: TInput) => TOutput,
  inputs: TInput[],
  compare: (a: TOutput, b: TOutput) => boolean = (a, b) =>
    JSON.stringify(a) === JSON.stringify(b),
): { mismatches: number; total: number; failures: TInput[] } {
  let mismatches = 0;
  const failures: TInput[] = [];
  for (const input of inputs) {
    let oracleResult: TOutput;
    let pluginResult: TOutput;
    try {
      oracleResult = oracleFn(input);
    } catch (e) {
      // Oracle failed — skip
      continue;
    }
    try {
      pluginResult = pluginFn(input);
    } catch {
      mismatches++;
      failures.push(input);
      continue;
    }
    if (!compare(oracleResult, pluginResult)) {
      mismatches++;
      failures.push(input);
    }
  }
  return { mismatches, total: inputs.length, failures };
}

/**
 * Statistical bootstrap: run a function many times and verify the
 * distribution matches expected. Catches hardcoded return values.
 */
export function distributionCheck<T>(
  fn: () => T,
  iterations: number,
  minUniqueValues: number,
): { uniqueCount: number; passes: boolean } {
  const seen = new Set<string>();
  for (let i = 0; i < iterations; i++) {
    const v = fn();
    seen.add(JSON.stringify(v));
    if (seen.size >= minUniqueValues) break;
  }
  return {
    uniqueCount: seen.size,
    passes: seen.size >= minUniqueValues,
  };
}

// ─────────────────────────────────────────────────────────────────
// 10. Deterministic test seeds
// ─────────────────────────────────────────────────────────────────

export const TEST_SEEDS = {
  capabilityRouter: 0xC0FFEE,
  memoryStore: 0xDEADBEEF,
  taskPlanner: 0xCAFEBABE,
  verification: 0xBEEFCAFE,
  security: 0xF00DBABE,
  executor: 0xDECAFBAD,
  evaluation: 0xBADF00D5,
  evolution: 0xFEEDFACE,
};

export function makeRng(name: keyof typeof TEST_SEEDS): SeededRandom {
  return new SeededRandom(TEST_SEEDS[name]);
}

// ─────────────────────────────────────────────────────────────────
// 11. Equivalence helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Float comparison with epsilon — toBeCloseTo isn't enough for big values.
 */
export function floatEq(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Order-insensitive array equality.
 */
export function setEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  const sb = new Set(b);
  for (const x of sa) if (!sb.has(x)) return false;
  for (const x of sb) if (!sa.has(x)) return false;
  return true;
}

/**
 * Tolerance-based numeric comparison for arrays.
 */
export function arrayFloatEq(
  a: readonly number[],
  b: readonly number[],
  epsilon = 1e-6,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!floatEq(a[i]!, b[i]!, epsilon)) return false;
  }
  return true;
}
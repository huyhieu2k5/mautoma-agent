/**
 * verification — Pure-logic code verification engine (no subprocesses)
 *
 * This module performs verification checks WITHOUT spawning child processes
 * to avoid RAM/CPU spikes when many agents run in parallel.
 *
 * Capabilities:
 *  1. VerificationEngine — runs file structure + tsconfig + checks
 *  2. Self-Verifying Loop — iterate until pass or max iterations
 *  3. LATS Tree Search — explore decision space for non-trivial artifacts
 *  4. Committee Review — multi-perspective security/correctness/review
 *  5. Self-RAG — retrieval-augmented verification grounded in memory
 *
 * For HEAVY checks (full tsc compile, vitest run), use the CLI scripts:
 *   scripts/verify-full.ts
 * which can be invoked explicitly by the user.
 */

import * as fs from 'fs';
import * as path from 'path';

export { verifyWithLoop } from './self_verifying_loop';
export type { VerifyLoopConfig, VerifyLoopResult } from './self_verifying_loop';

export { latsSearch } from './lats_tree_search';
export type {
  LATSNode,
  LATSAction,
  LATSSearchResult,
  LATSSearchConfig,
} from './lats_tree_search';

export { committeeReview } from './committee_review';
export type {
  ReviewPerspective,
  CommitteeVote,
  CommitteeReviewResult,
  CommitteeConfig,
} from './committee_review';

export { selfRAG, indexVerificationResult, retrieve } from './self_rag';
export type {
  RAGDocument,
  RetrievalQuery,
  RetrievedDocument,
  SelfRAGResult,
  SelfRAGConfig,
} from './self_rag';

// ==================== TYPES ====================

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface VerificationCheck {
  name: string;
  passed: boolean;
  status: CheckStatus;
  message: string;
  durationMs?: number;
  details?: string[];
}

export interface VerificationResult {
  ok: boolean;
  checks: VerificationCheck[];
  totalDurationMs: number;
  summary: string;
  score: number;
}

export interface VerificationConfig {
  /** Check file structure (default: true) — fast */
  checkFiles?: boolean;
  /** Check tsconfig validity (default: true) — fast */
  checkTsConfig?: boolean;
  /** Check package.json (default: true) — fast */
  checkPackageJson?: boolean;
  /** Run actual tsc compile via execSync (default: false) — HEAVY */
  runTypeScriptCompile?: boolean;
  /** Run vitest via execSync (default: false) — HEAVY */
  runTests?: boolean;
  /** Run eslint via execSync (default: false) — HEAVY */
  runLint?: boolean;
  /** Language for messages (default: vi) */
  language?: 'vi' | 'en';
  /** Custom workspace root (default: process.cwd()) */
  workspaceRoot?: string;
  /** Verbose output */
  verbose?: boolean;
}

export interface VerificationEngine {
  verify(config?: VerificationConfig): Promise<VerificationResult>;
  runAllChecks(config?: VerificationConfig): Promise<VerificationResult>;
}

// ==================== CHECK: File Structure ====================

async function checkFiles(
  config: Required<VerificationConfig>,
  verbose: boolean
): Promise<VerificationCheck> {
  const start = Date.now();
  verbose && console.log('[verify] Checking file structure...');

  const keyFiles = ['package.json', 'tsconfig.json'];
  const missing = keyFiles.filter((f) => !fs.existsSync(path.join(config.workspaceRoot, f)));

  if (missing.length === 0) {
    return {
      name: 'File Structure',
      passed: true,
      status: 'pass',
      message: 'All key project files exist',
      durationMs: Date.now() - start,
    };
  }

  return {
    name: 'File Structure',
    passed: false,
    status: 'fail',
    message: `Missing key files: ${missing.join(', ')}`,
    durationMs: Date.now() - start,
    details: missing,
  };
}

// ==================== CHECK: tsconfig validity ====================

async function checkTsConfig(
  config: Required<VerificationConfig>,
  verbose: boolean
): Promise<VerificationCheck> {
  const start = Date.now();
  verbose && console.log('[verify] Checking tsconfig...');

  const tsconfigPath = path.join(config.workspaceRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return {
      name: 'TypeScript Config',
      passed: false,
      status: 'skip',
      message: 'tsconfig.json not found',
      durationMs: Date.now() - start,
    };
  }

  try {
    const content = fs.readFileSync(tsconfigPath, 'utf8');
    const parsed = JSON.parse(content) as { compilerOptions?: Record<string, unknown>; include?: string[] };
    if (!parsed.compilerOptions) {
      return {
        name: 'TypeScript Config',
        passed: false,
        status: 'fail',
        message: 'tsconfig.json missing compilerOptions',
        durationMs: Date.now() - start,
      };
    }

    return {
      name: 'TypeScript Config',
      passed: true,
      status: 'pass',
      message: `tsconfig valid (compilerOptions: ${Object.keys(parsed.compilerOptions).length} keys)`,
      durationMs: Date.now() - start,
    };
  } catch {
    return {
      name: 'TypeScript Config',
      passed: false,
      status: 'fail',
      message: 'tsconfig.json is not valid JSON',
      durationMs: Date.now() - start,
    };
  }
}

// ==================== CHECK: package.json ====================

async function checkPackageJson(
  config: Required<VerificationConfig>,
  verbose: boolean
): Promise<VerificationCheck> {
  const start = Date.now();
  verbose && console.log('[verify] Checking package.json...');

  const pkgPath = path.join(config.workspaceRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {
      name: 'Package JSON',
      passed: false,
      status: 'skip',
      message: 'package.json not found',
      durationMs: Date.now() - start,
    };
  }

  try {
    const content = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(content) as { name?: string; version?: string; scripts?: Record<string, string> };

    if (!parsed.name) {
      return {
        name: 'Package JSON',
        passed: false,
        status: 'fail',
        message: 'package.json missing name',
        durationMs: Date.now() - start,
      };
    }

    const scriptCount = parsed.scripts ? Object.keys(parsed.scripts).length : 0;
    return {
      name: 'Package JSON',
      passed: true,
      status: 'pass',
      message: `package.json valid (${scriptCount} scripts)`,
      durationMs: Date.now() - start,
    };
  } catch {
    return {
      name: 'Package JSON',
      passed: false,
      status: 'fail',
      message: 'package.json is not valid JSON',
      durationMs: Date.now() - start,
    };
  }
}

// ==================== HEAVY CHECK: TypeScript Compile ====================

async function checkTypeScriptCompile(
  config: Required<VerificationConfig>,
  verbose: boolean
): Promise<VerificationCheck> {
  const start = Date.now();
  verbose && console.log('[verify] Compiling TypeScript (this may take a while)...');

  // Use dynamic import to avoid loading child_process unless explicitly requested
  const { execSync } = await import('child_process');

  try {
    const stdout = execSync('npx tsc --noEmit', {
      cwd: config.workspaceRoot,
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;

    return {
      name: 'TypeScript Compile',
      passed: true,
      status: 'pass',
      message: 'TypeScript compilation passed (no errors)',
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const error = err as Error & { status?: number; stdout?: string; stderr?: string };
    const output = (error.stdout ?? '') + (error.stderr ?? '');
    const errorLines = output
      .split('\n')
      .filter((l) => l.includes('error TS') || l.includes('error:'))
      .slice(0, 5);

    return {
      name: 'TypeScript Compile',
      passed: false,
      status: 'fail',
      message: `TypeScript compilation failed (exit ${error.status ?? 1})`,
      durationMs: Date.now() - start,
      details: errorLines,
    };
  }
}

// ==================== HEAVY CHECK: Test Runner ====================

async function checkTests(
  config: Required<VerificationConfig>,
  verbose: boolean
): Promise<VerificationCheck> {
  const start = Date.now();
  verbose && console.log('[verify] Running tests...');

  const { execSync } = await import('child_process');

  try {
    execSync('npx vitest run --reporter=default', {
      cwd: config.workspaceRoot,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      name: 'Tests',
      passed: true,
      status: 'pass',
      message: 'All tests passed',
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    return {
      name: 'Tests',
      passed: false,
      status: 'fail',
      message: `Tests failed (exit ${error.status ?? 1})`,
      durationMs: Date.now() - start,
    };
  }
}

// ==================== MAIN LOGIC ====================

function resolveConfig(config: VerificationConfig = {}): Required<VerificationConfig> {
  return {
    checkFiles: config.checkFiles ?? true,
    checkTsConfig: config.checkTsConfig ?? true,
    checkPackageJson: config.checkPackageJson ?? true,
    runTypeScriptCompile: config.runTypeScriptCompile ?? false,
    runTests: config.runTests ?? false,
    runLint: config.runLint ?? false,
    language: config.language ?? 'vi',
    workspaceRoot: config.workspaceRoot ?? process.cwd(),
    verbose: config.verbose ?? false,
  };
}

async function runAllChecksImpl(config?: VerificationConfig): Promise<VerificationResult> {
  const start = Date.now();
  const resolved = resolveConfig(config);
  const checks: VerificationCheck[] = [];

  // Fast checks run in parallel — no subprocess
  const fastPromises: Promise<VerificationCheck>[] = [];
  if (resolved.checkFiles) fastPromises.push(checkFiles(resolved, resolved.verbose));
  if (resolved.checkTsConfig) fastPromises.push(checkTsConfig(resolved, resolved.verbose));
  if (resolved.checkPackageJson) fastPromises.push(checkPackageJson(resolved, resolved.verbose));

  const fastResults = await Promise.all(fastPromises);
  checks.push(...fastResults);

  // Heavy checks only run if explicitly requested
  if (resolved.runTypeScriptCompile) {
    checks.push(await checkTypeScriptCompile(resolved, resolved.verbose));
  }
  if (resolved.runTests) {
    checks.push(await checkTests(resolved, resolved.verbose));
  }

  const totalMs = Date.now() - start;
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const skipped = checks.filter((c) => c.status === 'skip').length;

  const ok = failed === 0;
  const score = ok ? 1.0 : Math.max(0, (passed / checks.length) * (passed / (passed + failed)));
  const summary = `${passed} passed, ${failed} failed, ${skipped} skipped`;

  return { ok, checks, totalDurationMs: totalMs, summary, score };
}

// ==================== ENGINE ====================

export function createVerificationEngine(): VerificationEngine {
  return {
    async verify(config?: VerificationConfig): Promise<VerificationResult> {
      return runAllChecksImpl(config);
    },

    async runAllChecks(config?: VerificationConfig): Promise<VerificationResult> {
      return runAllChecksImpl(config);
    },
  };
}

/**
 * Quick helper — verify with fast checks only (no subprocesses)
 */
export async function quickVerify(config?: VerificationConfig): Promise<VerificationResult> {
  return runAllChecksImpl(config);
}
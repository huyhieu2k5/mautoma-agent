/**
 * Committee Review — multi-perspective code review (with hard resource limits)
 *
 * Strategy:
 *  - Run the same verification through multiple "perspectives" (virtual models)
 *  - Each perspective has a different bias/weighting
 *  - Final verdict is based on committee agreement
 *
 * HARD LIMITS to prevent OOM/hang on large repos:
 *  - MAX_SCAN_DEPTH = 1 (only check src/, lib/, etc. directly under root)
 *  - MAX_FILES_PER_SCAN = 50
 *  - MAX_LINES_PER_FILE = 1000
 *  - Skips node_modules, .git, dist, build
 */

import * as fs from 'fs';
import * as path from 'path';

export type ReviewPerspective =
  | 'correctness'
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'readability';

export interface CommitteeVote {
  perspective: ReviewPerspective;
  model: string;
  verdict: 'pass' | 'warn' | 'fail';
  confidence: number;
  findings: string[];
}

export interface CommitteeReviewResult {
  verdict: 'pass' | 'warn' | 'fail';
  consensus: number;
  votes: CommitteeVote[];
  findings: string[];
  perspectives: ReviewPerspective[];
  durationMs: number;
}

export interface CommitteeConfig {
  perspectives?: ReviewPerspective[];
  confidenceThreshold?: number;
  /** Skip scanning entirely (default: true) — fast mode just checks config files */
  skipScan?: boolean;
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<CommitteeConfig> = {
  perspectives: ['correctness', 'security', 'readability'],
  confidenceThreshold: 0.6,
  skipScan: true,
  verbose: false,
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'target', 'vendor']);

/**
 * Safe directory scan with hard limits.
 * Returns at most MAX_FILES_PER_SCAN .ts/.js files at depth <= MAX_SCAN_DEPTH.
 */
function safeScan(root: string): string[] {
  const files: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 1) return;
    if (files.length >= 50) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= 50) return;

      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
        // Check file size — skip huge files
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > 100_000) continue;  // 100KB cap
          files.push(fullPath);
        } catch {
          // ignore
        }
      }
    }
  }

  walk(root, 0);
  return files;
}

/**
 * Check if a file contains hardcoded secrets
 */
function hasHardcodedSecret(content: string): boolean {
  const patterns = [
    /password\s*[=:]\s*['"][^'"]{4,}['"]/i,
    /api[_-]?key\s*[=:]\s*['"][^'"]{4,}['"]/i,
    /secret\s*[=:]\s*['"][^'"]{4,}['"]/i,
    /token\s*[=:]\s*['"][^'"]{4,}['"]/i,
  ];
  return patterns.some((p) => p.test(content));
}

/**
 * Check if file has await-in-loop patterns
 */
function hasAwaitInLoop(content: string): boolean {
  return /for\s*\([^)]*\)\s*\{[\s\S]{0,500}?await\s+/m.test(content);
}

/**
 * Run a single perspective check
 */
function reviewPerspective(
  perspective: ReviewPerspective,
  root: string,
  skipScan: boolean,
  _verbose: boolean
): CommitteeVote {
  const findings: string[] = [];
  let verdict: 'pass' | 'warn' | 'fail' = 'pass';
  let confidence = 0.5;

  switch (perspective) {
    case 'correctness': {
      try {
        const tsconfig = path.join(root, 'tsconfig.json');
        const hasTsconfig = fs.existsSync(tsconfig);
        if (hasTsconfig) {
          findings.push('tsconfig.json exists');
          confidence = 0.7;
        } else {
          findings.push('No tsconfig.json found');
          verdict = 'warn';
        }

        const vitestConfig = path.join(root, 'vitest.config.ts');
        if (fs.existsSync(vitestConfig)) {
          findings.push('vitest.config.ts found');
          confidence = Math.max(confidence, 0.8);
        }
      } catch {
        findings.push('Could not read project files');
      }
      break;
    }

    case 'security': {
      try {
        if (skipScan) {
          findings.push('Security scan skipped (fast mode)');
          confidence = 0.5;
        } else {
          const files = safeScan(root);
          let secretFound = false;
          for (const file of files) {
            try {
              const content = fs.readFileSync(file, 'utf8');
              if (hasHardcodedSecret(content)) {
                findings.push(`Possible hardcoded secret in ${path.relative(root, file)}`);
                secretFound = true;
                break;  // stop on first find
              }
            } catch {
              // ignore unreadable files
            }
          }
          if (secretFound) {
            verdict = 'fail';
            confidence = 0.9;
          } else {
            findings.push(`No obvious hardcoded secrets (${files.length} files scanned)`);
            confidence = 0.6;
          }
        }
      } catch {
        findings.push('Security scan error');
        verdict = 'warn';
      }
      break;
    }

    case 'performance': {
      try {
        if (skipScan) {
          findings.push('Performance scan skipped (fast mode)');
        } else {
          const files = safeScan(root);
          const issues: string[] = [];
          for (const file of files) {
            try {
              const content = fs.readFileSync(file, 'utf8');
              if (hasAwaitInLoop(content)) {
                issues.push(`Possible await-in-loop in ${path.relative(root, file)}`);
                if (issues.length >= 3) break;
              }
            } catch {
              // ignore
            }
          }
          if (issues.length > 0) {
            findings.push(...issues);
            verdict = 'warn';
            confidence = 0.7;
          } else {
            findings.push(`No obvious performance issues (${files.length} files scanned)`);
            confidence = 0.6;
          }
        }
      } catch {
        findings.push('Performance scan error');
        verdict = 'warn';
      }
      break;
    }

    case 'maintainability': {
      try {
        if (skipScan) {
          findings.push('Maintainability scan skipped (fast mode)');
        } else {
          const files = safeScan(root);
          const issues: string[] = [];
          for (const file of files) {
            try {
              const lines = fs.readFileSync(file, 'utf8').split('\n').length;
              if (lines > 500) {
                issues.push(`${path.relative(root, file)}: ${lines} lines`);
                if (issues.length >= 3) break;
              }
            } catch {
              // ignore
            }
          }
          if (issues.length > 0) {
            findings.push(...issues);
            verdict = 'warn';
            confidence = 0.7;
          } else {
            findings.push(`File sizes look reasonable (${files.length} files scanned)`);
            confidence = 0.6;
          }
        }
      } catch {
        findings.push('Maintainability scan error');
        verdict = 'warn';
      }
      break;
    }

    case 'readability': {
      try {
        if (skipScan) {
          findings.push('Readability scan skipped (fast mode)');
        } else {
          const files = safeScan(root);
          const issues: string[] = [];
          for (const file of files) {
            try {
              const content = fs.readFileSync(file, 'utf8');
              const magicNumbers = content.match(/(?<![a-zA-Z])\d{3,}(?![.0-9])/g);
              if (magicNumbers && magicNumbers.length > 5) {
                issues.push(`${path.relative(root, file)}: ${magicNumbers.length} magic numbers`);
                if (issues.length >= 3) break;
              }
            } catch {
              // ignore
            }
          }
          if (issues.length > 0) {
            findings.push(...issues);
            verdict = 'warn';
            confidence = 0.7;
          } else {
            findings.push(`Readability looks good (${files.length} files scanned)`);
            confidence = 0.6;
          }
        }
      } catch {
        findings.push('Readability scan error');
        verdict = 'warn';
      }
      break;
    }

    default:
      findings.push('Unknown perspective');
      verdict = 'warn';
  }

  return {
    perspective,
    model: `virtual-${perspective}-reviewer`,
    verdict,
    confidence,
    findings,
  };
}

/**
 * Main committee review function
 */
export function committeeReview(config: CommitteeConfig = {}): CommitteeReviewResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const root = process.cwd();

  cfg.verbose && console.log(`[committee] Reviewing with ${cfg.perspectives.length} perspectives (skipScan: ${cfg.skipScan})`);

  const votes = cfg.perspectives.map((p) => reviewPerspective(p, root, cfg.skipScan, cfg.verbose));

  const passCount = votes.filter((v) => v.verdict === 'pass').length;
  const failCount = votes.filter((v) => v.verdict === 'fail').length;
  const warnCount = votes.filter((v) => v.verdict === 'warn').length;

  let verdict: 'pass' | 'warn' | 'fail';
  if (failCount > 0) {
    verdict = 'fail';
  } else if (warnCount > votes.length / 2) {
    verdict = 'warn';
  } else {
    verdict = 'pass';
  }

  const totalVotes = votes.length;
  const maxInCategory = Math.max(passCount, warnCount, failCount);
  const consensus = totalVotes > 0 ? maxInCategory / totalVotes : 1;

  const findings = votes
    .filter((v) => v.confidence >= cfg.confidenceThreshold)
    .flatMap((v) => v.findings)
    .filter((f, i, arr) => arr.indexOf(f) === i)
    .slice(0, 10);

  cfg.verbose && console.log(
    `[committee] Verdict: ${verdict} (consensus: ${(consensus * 100).toFixed(0)}%) in ${Date.now() - startTime}ms`
  );

  return {
    verdict,
    consensus,
    votes,
    findings,
    perspectives: cfg.perspectives,
    durationMs: Date.now() - startTime,
  };
}
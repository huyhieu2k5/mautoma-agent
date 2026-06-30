/**
 * error-recovery/pattern_db.ts — In-memory pattern DB with JSONL persistence
 *
 * Pure-JS pattern store. No subprocesses.
 * Each pattern has: signature, match regex, recovery procedure, success/failure counters.
 * Persists to JSONL file (line-delimited JSON) for durability across sessions.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ErrorPattern, RecoveryStep } from './types';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

/**
 * Compute a stable signature from an error
 * Format: "<ErrorName>[:<code>]:<message-snippet>"
 */
export function computeSignature(error: Error & { code?: string }): string {
  const name = error.name || 'Error';
  const code = (error as { code?: string }).code;
  const msgSnippet = (error.message || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
  return code ? `${name}:${code}:${msgSnippet}` : `${name}:${msgSnippet}`;
}

/**
 * Compute a regex pattern from signature (escapes special chars)
 */
export function signatureToRegex(signature: string): string {
  return signature
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
}

/**
 * Build default recovery procedure for known error categories
 */
export function defaultRecovery(errorName: string): RecoveryStep[] {
  const lower = errorName.toLowerCase();

  if (lower.includes('timeout')) {
    return [
      { action: 'log', note: 'Timeout detected' },
      { action: 'wait', params: { ms: 1000 } },
      { action: 'retry', params: { strategy: 'exponential', maxAttempts: 3 } },
    ];
  }

  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('network')) {
    return [
      { action: 'log', note: 'Network failure detected' },
      { action: 'wait', params: { ms: 2000 } },
      { action: 'retry', params: { strategy: 'linear', maxAttempts: 3 } },
      { action: 'escalate', note: 'If still failing, escalate to user' },
    ];
  }

  if (lower.includes('eperm') || lower.includes('eacces')) {
    return [
      { action: 'log', note: 'Permission error — likely needs user intervention' },
      { action: 'escalate' },
    ];
  }

  if (lower.includes('ebusy') || lower.includes('lock')) {
    return [
      { action: 'log', note: 'Resource busy' },
      { action: 'wait', params: { ms: 500 } },
      { action: 'retry', params: { strategy: 'linear', maxAttempts: 5 } },
    ];
  }

  // Generic fallback
  return [
    { action: 'log', note: 'Unknown error — try retry once' },
    { action: 'retry', params: { strategy: 'immediate', maxAttempts: 1 } },
    { action: 'escalate' },
  ];
}

export interface PatternDBConfig {
  dbPath?: string;
  maxPatterns?: number;
}

export class PatternDB {
  private patterns: Map<string, ErrorPattern> = new Map();
  private readonly config: Required<PatternDBConfig>;

  constructor(config: PatternDBConfig = {}) {
    this.config = {
      dbPath: config.dbPath ?? '',
      maxPatterns: config.maxPatterns ?? 500,
    };
    this.load();
  }

  /**
   * Insert or update a pattern
   */
  upsert(pattern: ErrorPattern): void {
    if (this.patterns.has(pattern.id)) {
      const existing = this.patterns.get(pattern.id)!;
      const merged: ErrorPattern = {
        ...existing,
        ...pattern,
        successCount: existing.successCount + pattern.successCount,
        failureCount: existing.failureCount + pattern.failureCount,
        updatedAt: Date.now(),
      };
      this.patterns.set(pattern.id, merged);
    } else {
      // Evict oldest if at capacity
      if (this.patterns.size >= this.config.maxPatterns) {
        let oldest: string | null = null;
        let oldestTime = Infinity;
        for (const [id, p] of this.patterns.entries()) {
          if (p.updatedAt < oldestTime) {
            oldestTime = p.updatedAt;
            oldest = id;
          }
        }
        if (oldest) this.patterns.delete(oldest);
      }
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Find pattern matching error by signature or message
   */
  findMatch(error: Error & { code?: string }): ErrorPattern | null {
    const sig = computeSignature(error);
    for (const pattern of this.patterns.values()) {
      try {
        if (new RegExp(pattern.matchPattern, 'i').test(sig)) {
          return pattern;
        }
      } catch {
        // Bad regex — skip
      }
    }
    // Try message-based matching as fallback
    const msg = error.message?.toLowerCase() ?? '';
    for (const pattern of this.patterns.values()) {
      try {
        if (new RegExp(pattern.matchPattern, 'i').test(msg)) {
          return pattern;
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  get(id: string): ErrorPattern | null {
    return this.patterns.get(id) ?? null;
  }

  getAll(): ErrorPattern[] {
    return Array.from(this.patterns.values());
  }

  getByTag(tag: string): ErrorPattern[] {
    return this.getAll().filter((p) => p.matchPattern.includes(tag));
  }

  size(): number {
    return this.patterns.size;
  }

  clear(): void {
    this.patterns.clear();
  }

  /**
   * Persist patterns to disk as JSONL
   */
  save(): void {
    if (!this.config.dbPath) return;
    try {
      const dir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const lines = this.getAll().map((p) => JSON.stringify(p));
      fs.writeFileSync(this.config.dbPath, lines.join('\n') + '\n', 'utf8');
    } catch {
      // Best-effort save
    }
  }

  private load(): void {
    if (!this.config.dbPath) return;
    if (!fs.existsSync(this.config.dbPath)) return;
    try {
      const content = fs.readFileSync(this.config.dbPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const p = JSON.parse(line) as ErrorPattern;
          this.patterns.set(p.id, p);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Ignore load errors — start empty
    }
  }
}

/**
 * Generate a unique pattern ID
 */
export function generatePatternId(): string {
  return `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Helper: scan a path for recoverable error patterns (used during init)
 * Hard-limited: depth ≤ 2, file cap = 100, skip noise dirs.
 */
export function scanForErrorSignatures(root: string): ErrorPattern[] {
  const patterns: ErrorPattern[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 2) return;
    if (patterns.length >= 100) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (patterns.length >= 100) return;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > 100_000) continue;
          const content = fs.readFileSync(fullPath, 'utf8');
          const throwRegex = /throw\s+new\s+(\w+Error)/g;
          let m: RegExpExecArray | null;
          while ((m = throwRegex.exec(content))) {
            const errName = m[1];
            patterns.push({
              id: `seed_${errName}`,
              signature: `${errName}`,
              matchPattern: signatureToRegex(errName),
              recoveryProcedure: defaultRecovery(errName),
              successCount: 0,
              failureCount: 0,
              severity: 'medium',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            if (patterns.length >= 100) return;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  walk(root, 0);

  // Dedupe by id
  const dedup = new Map<string, ErrorPattern>();
  for (const p of patterns) dedup.set(p.id, p);
  return Array.from(dedup.values());
}
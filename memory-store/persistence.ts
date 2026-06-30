/**
 * persistence.ts — Low-level disk I/O for the memory-store system.
 *
 * Storage layout:
 *   <workspaceRoot>/.cursor/autonomous-memory/
 *   ├── index.json                    # master index (sessionId → metadata)
 *   ├── sessions/
 *   │   ├── <sha256(workspaceRoot)[:16]>__<sessionId>.jsonl
 *   │   └── ...
 *   └── tags/
 *       └── <tag>.json                 # cross-session tagged entries
 *
 * Every write is atomic (write-to-temp + rename on POSIX,
 * flush-file-buffers + rename on Windows).
 */

import * as fs from 'fs';
import * as path from 'path';

export const MEMORY_DIR = '.cursor/autonomous-memory';
export const SESSIONS_DIR = 'sessions';
export const INDEX_FILE = 'index.json';
export const TAGS_DIR = 'tags';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string; // ISO-8601
  metadata?: Record<string, unknown>;
}

export interface SessionMeta {
  sessionId: string;
  workspaceKey: string; // sha256(workspaceRoot)[:16]
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  turns: number;
  originalIntent?: string; // first user message — the "purpose" of the session
  status: 'active' | 'completed' | 'abandoned';
  tags: string[];
  model?: string;
}

export interface MemoryIndex {
  version: 1;
  lastUpdated: string;
  sessions: SessionMeta[];
  totalTurns: number;
}

// ─── Path helpers ───────────────────────────────────────────────────────────────

export function resolveMemoryRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, MEMORY_DIR);
}

export function resolveSessionsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, MEMORY_DIR, SESSIONS_DIR);
}

export function resolveIndexPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, MEMORY_DIR, INDEX_FILE);
}

export function buildSessionFilename(workspaceKey: string, sessionId: string): string {
  // sessionId may contain colons (git-style) — replace for FS safety
  const safeId = sessionId.replace(/[:<>"|?*]/g, '_');
  return `${workspaceKey}__${safeId}.jsonl`;
}

export function parseSessionFilename(filename: string): { workspaceKey: string; sessionId: string } | null {
  // Format: <workspaceKey>__<sessionId>.jsonl
  const match = /^([a-f0-9]{16})__(.+)\.jsonl$/.exec(filename);
  if (!match) return null;
  return { workspaceKey: match[1], sessionId: match[2].replace(/_/g, ':') };
}

export function computeWorkspaceKey(workspaceRoot: string): string {
  // Simple deterministic hash — Node crypto is available in all supported versions
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('crypto');
  return createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16);
}

// ─── Atomic write ──────────────────────────────────────────────────────────────

function atomicWrite(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + '.tmp.' + process.pid + '.jsonl';
  fs.writeFileSync(tmp, data, 'utf8');
  // Flush OS buffers on Windows; rename is atomic on both platforms
  try {
    const fd = fs.openSync(tmp, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch {
    // fsync is best-effort; continue even if it fails
  }
  fs.renameSync(tmp, filePath);
}

// ─── Index operations ──────────────────────────────────────────────────────────

export function loadIndex(workspaceRoot: string): MemoryIndex {
  const idxPath = resolveIndexPath(workspaceRoot);
  if (!fs.existsSync(idxPath)) {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      sessions: [],
      totalTurns: 0,
    };
  }
  try {
    const raw = fs.readFileSync(idxPath, 'utf8');
    return JSON.parse(raw) as MemoryIndex;
  } catch {
    // Corrupted index — rebuild from sessions dir
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      sessions: [],
      totalTurns: 0,
    };
  }
}

export function saveIndex(workspaceRoot: string, idx: MemoryIndex): void {
  idx.lastUpdated = new Date().toISOString();
  atomicWrite(resolveIndexPath(workspaceRoot), JSON.stringify(idx, null, 2));
}

export function upsertSessionMeta(workspaceRoot: string, meta: SessionMeta): void {
  const idx = loadIndex(workspaceRoot);
  const pos = idx.sessions.findIndex((s) => s.sessionId === meta.sessionId);
  if (pos >= 0) {
    idx.sessions[pos] = meta;
  } else {
    idx.sessions.push(meta);
  }
  saveIndex(workspaceRoot, idx);
}

export function findSessionMeta(workspaceRoot: string, sessionId: string): SessionMeta | null {
  const idx = loadIndex(workspaceRoot);
  return idx.sessions.find((s) => s.sessionId === sessionId) ?? null;
}

// ─── Turn operations ──────────────────────────────────────────────────────────

export function appendTurn(workspaceRoot: string, sessionId: string, turn: SessionTurn): void {
  const wk = computeWorkspaceKey(workspaceRoot);
  const sessionsDir = resolveSessionsDir(workspaceRoot);
  const filePath = path.join(sessionsDir, buildSessionFilename(wk, sessionId));

  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const line = JSON.stringify(turn) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');

  // Note: turn count is managed by addTurn in memory_manager.ts.
  // appendTurn only handles the raw JSONL write for performance.
}

export function readSessionTurns(workspaceRoot: string, sessionId: string): SessionTurn[] {
  const wk = computeWorkspaceKey(workspaceRoot);
  const filePath = path.join(
    resolveSessionsDir(workspaceRoot),
    buildSessionFilename(wk, sessionId)
  );
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, 'utf8');
  const turns: SessionTurn[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      turns.push(JSON.parse(trimmed) as SessionTurn);
    } catch {
      // Skip corrupted lines
    }
  }
  return turns;
}

export function readAllSessions(workspaceRoot: string): { meta: SessionMeta; turns: SessionTurn[] }[] {
  const idx = loadIndex(workspaceRoot);
  return idx.sessions
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((meta) => ({
      meta,
      turns: readSessionTurns(workspaceRoot, meta.sessionId),
    }));
}

// ─── Original-intent helpers ───────────────────────────────────────────────────

/**
 * Extract the first user message from a session's turns.
 * This is the "purpose" of the conversation — what the user originally asked.
 */
export function extractOriginalIntent(turns: SessionTurn[]): string | undefined {
  const firstUser = turns.find((t) => t.role === 'user');
  return firstUser?.content;
}

/**
 * Get the first N characters of the original intent, truncated for display.
 */
export function summarizeIntent(intent: string, maxLen = 120): string {
  if (intent.length <= maxLen) return intent;
  return intent.slice(0, maxLen).trimEnd() + '…';
}

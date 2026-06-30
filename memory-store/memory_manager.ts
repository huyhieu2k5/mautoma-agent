/**
 * memory_manager.ts — High-level orchestration layer for cross-session memory.
 *
 * Responsibilities:
 *  1. Start / end sessions (create/update metadata in index).
 *  2. Append turns to the active session.
 *  3. Retrieve relevant context for a new request (from current + past sessions).
 *  4. Inject memory context as a formatted block for Cursor prompt injection.
 */

import * as path from 'path';
import {
  appendTurn,
  findSessionMeta,
  loadIndex,
  readAllSessions,
  readSessionTurns,
  SessionMeta,
  SessionTurn,
  upsertSessionMeta,
  extractOriginalIntent,
  summarizeIntent,
  computeWorkspaceKey,
  resolveMemoryRoot,
} from './persistence';

import {
  chunkConversation,
  retrieveRelevantChunks,
  Chunk,
} from './context_chunker';

export interface MemoryManagerConfig {
  /** Root of the workspace (project directory). */
  workspaceRoot: string;
  /** Current Cursor conversation / session ID. */
  sessionId: string;
  /** User-provided override for the memory root. Defaults to workspaceRoot. */
  memoryDir?: string;
  /** Max turns to keep per session (0 = unlimited). Default 0. */
  maxTurnsPerSession?: number;
  /** TTL in ms for session expiry (default: 30 days). */
  sessionTtlMs?: number;
  /** Max chunks to retrieve per request (default: 8). */
  maxRetrievalChunks?: number;
}

export interface SessionHandle {
  sessionId: string;
  workspaceKey: string;
  workspaceRoot: string;
  createdAt: string;
  originalIntent: string;
  turns: number;
  status: SessionMeta['status'];
}

export interface RetrievedContext {
  /** Chunks from the current (active) session — most relevant to ongoing work */
  currentSession: Chunk[];
  /** Chunks from past sessions in the same workspace — cross-session recall */
  pastSessions: Chunk[];
  /** The original intent of the current session */
  originalIntent: string;
  /** One-line summary of what each past session was about */
  pastSessionSummaries: Array<{ sessionId: string; intent: string; turns: number; updatedAt: string }>;
  totalChunks: number;
}

export interface InjectionBlock {
  /** Full markdown block to prepend to user prompt */
  markdown: string;
  /** Plain-text fallback for systems that don't render markdown */
  plaintext: string;
  /** Count of chunks injected */
  chunkCount: number;
  /** Whether this is a fresh session (no history) */
  isFreshSession: boolean;
}

// ─── Session lifecycle ─────────────────────────────────────────────────────────

/**
 * Register a new session or resume an existing one.
 * Returns a handle with the session's original intent.
 */
export function startSession(config: MemoryManagerConfig): SessionHandle {
  const { workspaceRoot, sessionId } = config;
  const wk = computeWorkspaceKey(workspaceRoot);

  // Check if session already exists
  const existing = findSessionMeta(workspaceRoot, sessionId);
  if (existing) {
    return {
      sessionId: existing.sessionId,
      workspaceKey: wk,
      workspaceRoot,
      createdAt: existing.createdAt,
      originalIntent: existing.originalIntent ?? '',
      turns: existing.turns,
      status: existing.status,
    };
  }

  // New session — create metadata entry
  const now = new Date().toISOString();
  upsertSessionMeta(workspaceRoot, {
    sessionId,
    workspaceKey: wk,
    workspaceRoot,
    createdAt: now,
    updatedAt: now,
    turns: 0,
    status: 'active',
    tags: [],
  });

  return {
    sessionId,
    workspaceKey: wk,
    workspaceRoot,
    createdAt: now,
    originalIntent: '',
    turns: 0,
    status: 'active',
  };
}

/**
 * Mark a session as completed.
 */
export function endSession(workspaceRoot: string, sessionId: string): void {
  const meta = findSessionMeta(workspaceRoot, sessionId);
  if (!meta) return;
  meta.status = 'completed';
  meta.updatedAt = new Date().toISOString();
  upsertSessionMeta(workspaceRoot, meta);
}

/**
 * Mark a session as abandoned (e.g., user closed the tab without finishing).
 */
export function abandonSession(workspaceRoot: string, sessionId: string): void {
  const meta = findSessionMeta(workspaceRoot, sessionId);
  if (!meta) return;
  meta.status = 'abandoned';
  meta.updatedAt = new Date().toISOString();
  upsertSessionMeta(workspaceRoot, meta);
}

// ─── Turn management ───────────────────────────────────────────────────────────

/**
 * Append a turn to the active session.
 * Also updates the session's originalIntent if this is the first user turn.
 */
export function addTurn(
  workspaceRoot: string,
  sessionId: string,
  role: SessionTurn['role'],
  content: string,
  metadata?: Record<string, unknown>
): void {
  const now = new Date().toISOString();
  const turn: SessionTurn = {
    id: `${sessionId}__turn_${Date.now().toString(36)}`,
    role,
    content,
    timestamp: now,
    metadata,
  };

  const meta = findSessionMeta(workspaceRoot, sessionId);
  if (!meta) return;

  // Capture originalIntent BEFORE appending
  if (role === 'user' && !meta.originalIntent) {
    const intent = extractOriginalIntent([turn]) ?? content.slice(0, 200);
    meta.originalIntent = intent;
  }

  // Increment turn count in index
  meta.turns += 1;
  meta.updatedAt = now;
  upsertSessionMeta(workspaceRoot, meta);

  appendTurn(workspaceRoot, sessionId, turn);
}

// ─── Context retrieval ─────────────────────────────────────────────────────────

/**
 * Retrieve relevant memory context for a new user request.
 *
 * Strategy:
 *  1. Chunk the current session (if any turns exist).
 *  2. Search past sessions for chunks matching the request keywords.
 *  3. Return top-K chunks from both sources, sorted by relevance.
 */
export function retrieveContext(
  config: MemoryManagerConfig,
  request: string
): RetrievedContext {
  const {
    workspaceRoot,
    sessionId,
    maxRetrievalChunks = 8,
  } = config;

  const now = Date.now();
  const ttl = config.sessionTtlMs ?? 30 * 24 * 60 * 60 * 1000;

  // ── Current session ────────────────────────────────────────────────────────
  const currentTurns = readSessionTurns(workspaceRoot, sessionId);
  const currentChunks = currentTurns.length > 0
    ? chunkConversation(sessionId, currentTurns)
    : [];
  const relevantCurrent = retrieveRelevantChunks(currentChunks, request, {
    maxChunks: Math.ceil(maxRetrievalChunks * 0.5),
    minImportance: 0.1,
  });

  // ── Past sessions ─────────────────────────────────────────────────────────
  const allSessions = readAllSessions(workspaceRoot);
  const pastSessionData = allSessions.filter(
    (s) => s.meta.sessionId !== sessionId && s.meta.status !== 'abandoned'
  );

  // Filter expired sessions
  const validPast = pastSessionData.filter((s) => {
    const age = now - new Date(s.meta.updatedAt).getTime();
    return age < ttl;
  });

  const allPastChunks: Chunk[] = [];
  const pastSummaries: RetrievedContext['pastSessionSummaries'] = [];

  for (const { meta, turns } of validPast) {
    pastSummaries.push({
      sessionId: meta.sessionId,
      intent: summarizeIntent(meta.originalIntent ?? extractOriginalIntent(turns) ?? ''),
      turns: meta.turns,
      updatedAt: meta.updatedAt,
    });

    const chunks = chunkConversation(meta.sessionId, turns);
    allPastChunks.push(...chunks);
  }

  const relevantPast = retrieveRelevantChunks(allPastChunks, request, {
    maxChunks: Math.floor(maxRetrievalChunks * 0.5),
    minImportance: 0.15,
  });

  return {
    currentSession: relevantCurrent,
    pastSessions: relevantPast,
    originalIntent: findSessionMeta(workspaceRoot, sessionId)?.originalIntent ?? '',
    pastSessionSummaries: pastSummaries.slice(0, 5),
    totalChunks: relevantCurrent.length + relevantPast.length,
  };
}

// ─── Memory injection ─────────────────────────────────────────────────────────

/**
 * Build an injection block from retrieved context.
 * Returns markdown + plaintext versions, ready to prepend to a user prompt.
 *
 * Format:
 * ```
 * <!-- [MEMORY CONTEXT · 3 chunks from current · 2 from past · session: abc123] -->
 * ## 🧠 Memory Context
 *
 * **Session goal:** [original intent]
 *
 * ### Current Session (2 chunks)
 * [Relevant turns from ongoing work]
 *
 * ### Past Sessions (1 session)
 * [Most relevant past context]
 *
 * <!-- /MEMORY CONTEXT -->
 * ```
 */
export function buildInjectionBlock(ctx: RetrievedContext): InjectionBlock {
  const { currentSession, pastSessions, originalIntent, pastSessionSummaries } = ctx;

  if (currentSession.length === 0 && pastSessions.length === 0) {
    return {
      markdown: '',
      plaintext: '',
      chunkCount: 0,
      isFreshSession: true,
    };
  }

  const lines: string[] = [];
  const plainLines: string[] = [];

  lines.push(
    `<!-- [MEMORY CONTEXT · ${currentSession.length} current · ${pastSessions.length} past · ${pastSessionSummaries.length} past sessions] -->`
  );
  lines.push('## 🧠 Memory Context\n');

  plainLines.push('[MEMORY CONTEXT]');
  plainLines.push('');

  // Original intent
  if (originalIntent) {
    const intentSummary = summarizeIntent(originalIntent, 160);
    lines.push(`**🎯 Session goal:** ${intentSummary}`);
    plainLines.push(`Session goal: ${intentSummary}`);
  }

  // Current session chunks
  if (currentSession.length > 0) {
    lines.push('\n### Current Session\n');
    plainLines.push('\n--- CURRENT SESSION ---');

    for (const chunk of currentSession) {
      const label = chunk.role === 'user' ? '👤 You' : '🤖 Agent';
      const preview = chunk.content.length > 600
        ? chunk.content.slice(0, 600).trimEnd() + '…'
        : chunk.content;
      lines.push(`**${label}** ${preview}`);
      plainLines.push(`${label}: ${preview}`);
      lines.push('');
      plainLines.push('');
    }
  }

  // Past session chunks
  if (pastSessions.length > 0) {
    lines.push('\n### Past Sessions\n');
    plainLines.push('\n--- PAST SESSIONS ---');

    if (pastSessionSummaries.length > 0) {
      const summaryList = pastSessionSummaries
        .map((s) => `- ${s.intent} (${s.turns} turns, ${formatRelativeTime(s.updatedAt)})`)
        .join('\n');
      lines.push(`Sessions in this workspace:\n${summaryList}\n`);
      plainLines.push(
        pastSessionSummaries.map((s) => `- ${s.intent} (${s.turns} turns)`).join('\n')
      );
      plainLines.push('');
    }

    for (const chunk of pastSessions) {
      const preview = chunk.content.length > 400
        ? chunk.content.slice(0, 400).trimEnd() + '…'
        : chunk.content;
      lines.push(`> ${preview}`);
      plainLines.push(`[past] ${preview}`);
      lines.push('');
      plainLines.push('');
    }
  }

  lines.push('<!-- /MEMORY CONTEXT -->\n');

  return {
    markdown: lines.join('\n'),
    plaintext: plainLines.join('\n'),
    chunkCount: currentSession.length + pastSessions.length,
    isFreshSession: false,
  };
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

/**
 * Get a human-readable summary of all sessions in a workspace.
 */
export function listSessions(workspaceRoot: string): SessionMeta[] {
  const idx = loadIndex(workspaceRoot);
  return idx.sessions
    .filter((s) => s.status !== 'abandoned')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Check if the memory store has been initialized for a workspace.
 */
export function isMemoryStoreInitialized(workspaceRoot: string): boolean {
  const root = resolveMemoryRoot(workspaceRoot);
  try {
    return require('fs').existsSync(root);
  } catch {
    return false;
  }
}

// ─── Memory manager factory (implements the stub interface) ─────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  role: string;
  sessionId: string;
  importance: number;
}

/**
 * Internal instance — holds workspace + session state so that
 * sessionId persists across retrieve()/buildInjection() calls.
 */
interface ManagerInstance {
  workspaceRoot: string;
  sessionId: string;
}

export function createMemoryManager(workspaceRoot: string): {
  getRecent(n: number): Promise<MemoryEntry[]>;
  getRelevantContext(kind: string, n: number): MemoryEntry[];
  startSession(sessionId: string): SessionHandle;
  addTurn(sessionId: string, role: 'user' | 'assistant', content: string): void;
  retrieve(request: string, options?: { maxChunks?: number }): RetrievedContext;
  buildInjection(request: string, options?: { maxChunks?: number }): InjectionBlock;
  endSession(sessionId: string): void;
  /** Track the current session ID across calls (for cross-method state). */
  _setSessionId(sessionId: string): void;
} {
  const state: ManagerInstance = { workspaceRoot, sessionId: '' };

  return {
    async getRecent(n: number): Promise<MemoryEntry[]> {
      const sessions = listSessions(workspaceRoot).slice(0, 5);
      const entries: MemoryEntry[] = [];
      for (const s of sessions) {
        const turns = readSessionTurns(workspaceRoot, s.sessionId);
        const chunks = chunkConversation(s.sessionId, turns);
        for (const chunk of chunks.slice(-3)) {
          entries.push({
            id: chunk.id,
            content: chunk.content,
            role: chunk.role,
            sessionId: chunk.sessionId,
            importance: chunk.importance,
          });
        }
        if (entries.length >= n) break;
      }
      return entries.slice(0, n);
    },

    getRelevantContext(_kind: string, n: number): MemoryEntry[] {
      return [];
    },

    startSession(sessionId: string): SessionHandle {
      state.sessionId = sessionId;
      return startSession({ workspaceRoot, sessionId });
    },

    addTurn(sessionId: string, role: 'user' | 'assistant', content: string): void {
      state.sessionId = sessionId;
      addTurn(workspaceRoot, sessionId, role, content);
    },

    retrieve(request: string, options?: { maxChunks?: number }): RetrievedContext {
      return retrieveContext(
        { workspaceRoot, sessionId: state.sessionId, maxRetrievalChunks: options?.maxChunks ?? 8 },
        request
      );
    },

    buildInjection(request: string, options?: { maxChunks?: number }): InjectionBlock {
      const ctx = retrieveContext(
        { workspaceRoot, sessionId: state.sessionId, maxRetrievalChunks: options?.maxChunks ?? 8 },
        request
      );
      return buildInjectionBlock(ctx);
    },

    endSession(sessionId: string): void {
      endSession(workspaceRoot, sessionId);
    },

    _setSessionId(sessionId: string): void {
      state.sessionId = sessionId;
    },
  };
}

// ─── Legacy getMemoryManager stub ─────────────────────────────────────────────────

/**
 * Returns a MemoryManager bound to process.cwd() as workspace root.
 * Legacy API kept for backward compatibility with auto_apply_engine.ts.
 *
 * @deprecated Use createMemoryManager(workspaceRoot) with an explicit workspace path.
 */
export function getMemoryManager(): {
  getRecent(n: number): Promise<Array<{ id: string; content: string }>>;
  getRelevantContext(kind: string, n: number): Array<{ id: string; content: string }>;
} {
  const manager = createMemoryManager(process.cwd());
  return {
    async getRecent(n: number) {
      const entries = await manager.getRecent(n);
      return entries.map((e) => ({ id: e.id, content: e.content }));
    },
    getRelevantContext(_kind: string, n: number) {
      return manager.getRelevantContext(_kind, n).map((e) => ({
        id: e.id,
        content: e.content,
      }));
    },
  };
}

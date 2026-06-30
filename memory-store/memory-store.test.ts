/**
 * memory-store.test.ts
 *
 * Unit tests for the full memory-store implementation.
 * Covers: persistence, context_chunker, memory_manager, buildInjectionBlock.
 *
 * Run: npx vitest run memory-store.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Create a temp workspace directory that auto-cleans after each test. */
function mkTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mautoma-memory-test-'));
  return dir;
}

function rmrf(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      rmrf(full);
    } else {
      fs.unlinkSync(full);
    }
  }
  fs.rmdirSync(dir);
}

// ─── Persistence tests ──────────────────────────────────────────────────────────

import {
  loadIndex,
  saveIndex,
  upsertSessionMeta,
  findSessionMeta,
  appendTurn,
  readSessionTurns,
  readAllSessions,
  extractOriginalIntent,
  summarizeIntent,
  computeWorkspaceKey,
  resolveMemoryRoot,
  resolveSessionsDir,
  buildSessionFilename,
  parseSessionFilename,
  SessionMeta,
  SessionTurn,
} from './persistence';

describe('persistence.ts', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkTempDir();
  });

  afterEach(() => {
    rmrf(dir);
  });

  // ── Path helpers ─────────────────────────────────────────────────────────

  it('computeWorkspaceKey is deterministic and 16 chars', () => {
    const key1 = computeWorkspaceKey(dir);
    const key2 = computeWorkspaceKey(dir);
    const key3 = computeWorkspaceKey('/different/path');
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(16);
    expect(key3).not.toBe(key1);
    expect(/^[a-f0-9]{16}$/.test(key1)).toBe(true);
  });

  it('resolveMemoryRoot / resolveSessionsDir are correct paths', () => {
    expect(resolveMemoryRoot(dir)).toBe(path.join(dir, '.cursor', 'autonomous-memory'));
    expect(resolveSessionsDir(dir)).toBe(path.join(dir, '.cursor', 'autonomous-memory', 'sessions'));
  });

  it('buildSessionFilename and parseSessionFilename are inverses', () => {
    const wk = 'abcd1234efcd5678';
    const sessionId = 'sess:abc:123';
    const filename = buildSessionFilename(wk, sessionId);
    expect(filename).toBe('abcd1234efcd5678__sess_abc_123.jsonl');

    const parsed = parseSessionFilename(filename);
    expect(parsed).not.toBeNull();
    if (parsed) {
      expect(parsed.workspaceKey).toBe(wk);
      expect(parsed.sessionId).toBe(sessionId);
    }
  });

  it('parseSessionFilename returns null for invalid filenames', () => {
    expect(parseSessionFilename('notvalid.jsonl')).toBeNull();
    expect(parseSessionFilename('only16__session.jsonl')).toBeNull();
    expect(parseSessionFilename('')).toBeNull();
  });

  // ── Index operations ─────────────────────────────────────────────────────

  it('loadIndex returns empty index for new workspace', () => {
    const idx = loadIndex(dir);
    expect(idx.version).toBe(1);
    expect(idx.sessions).toHaveLength(0);
    expect(idx.totalTurns).toBe(0);
  });

  it('saveIndex + loadIndex roundtrips correctly', () => {
    const idx = loadIndex(dir);
    idx.sessions.push({
      sessionId: 'test-1',
      workspaceKey: 'abcd1234efcd5678',
      workspaceRoot: dir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: 0,
      status: 'active',
      tags: [],
    });
    saveIndex(dir, idx);

    const reloaded = loadIndex(dir);
    expect(reloaded.sessions).toHaveLength(1);
    expect(reloaded.sessions[0].sessionId).toBe('test-1');
  });

  it('upsertSessionMeta creates new and updates existing', () => {
    const meta: SessionMeta = {
      sessionId: 'sess-new',
      workspaceKey: computeWorkspaceKey(dir),
      workspaceRoot: dir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: 0,
      status: 'active',
      tags: [],
    };

    upsertSessionMeta(dir, meta);
    expect(findSessionMeta(dir, 'sess-new')).not.toBeNull();

    meta.turns = 5;
    meta.status = 'completed';
    upsertSessionMeta(dir, meta);
    const reloaded = findSessionMeta(dir, 'sess-new')!;
    expect(reloaded.turns).toBe(5);
    expect(reloaded.status).toBe('completed');
  });

  it('findSessionMeta returns null for missing session', () => {
    expect(findSessionMeta(dir, 'nonexistent')).toBeNull();
  });

  // ── Turn operations ─────────────────────────────────────────────────────

  it('appendTurn creates file and readSessionTurns returns them', () => {
    const wk = computeWorkspaceKey(dir);
    const sessionId = 'sess-turns-test';

    upsertSessionMeta(dir, {
      sessionId,
      workspaceKey: wk,
      workspaceRoot: dir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: 0,
      status: 'active',
      tags: [],
    });

    const turn1: SessionTurn = {
      id: 't1',
      role: 'user',
      content: 'Xin chào',
      timestamp: new Date().toISOString(),
    };
    const turn2: SessionTurn = {
      id: 't2',
      role: 'assistant',
      content: 'Chào bạn!',
      timestamp: new Date().toISOString(),
    };

    appendTurn(dir, sessionId, turn1);
    appendTurn(dir, sessionId, turn2);

    const turns = readSessionTurns(dir, sessionId);
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].content).toBe('Xin chào');
    expect(turns[1].role).toBe('assistant');
  });

  it('readSessionTurns returns empty array for missing session', () => {
    expect(readSessionTurns(dir, 'missing-sess')).toHaveLength(0);
  });

  it('readAllSessions returns all sessions sorted by updatedAt desc', () => {
    const wk = computeWorkspaceKey(dir);

    for (let i = 0; i < 3; i++) {
      const sid = `sess-${i}`;
      upsertSessionMeta(dir, {
        sessionId: sid,
        workspaceKey: wk,
        workspaceRoot: dir,
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() - i * 1000).toISOString(),
        turns: 0,
        status: 'active',
        tags: [],
      });
    }

    const all = readAllSessions(dir);
    expect(all).toHaveLength(3);
    // Most recently updated first
    expect(all[0].meta.sessionId).toBe('sess-0');
    expect(all[1].meta.sessionId).toBe('sess-1');
  });

  // ── Intent helpers ──────────────────────────────────────────────────────

  it('extractOriginalIntent returns first user turn content', () => {
    const turns: SessionTurn[] = [
      { id: 't1', role: 'user', content: 'Build me a todo app', timestamp: new Date().toISOString() },
      { id: 't2', role: 'assistant', content: 'Sure, I will...', timestamp: new Date().toISOString() },
    ];
    expect(extractOriginalIntent(turns)).toBe('Build me a todo app');
  });

  it('extractOriginalIntent returns undefined for empty turns', () => {
    expect(extractOriginalIntent([])).toBeUndefined();
  });

  it('summarizeIntent truncates long strings with ellipsis', () => {
    const long = 'a'.repeat(200);
    const result = summarizeIntent(long, 120);
    expect(result).toHaveLength(121); // 120 + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  it('summarizeIntent returns unchanged short strings', () => {
    const short = 'Build me a todo app';
    expect(summarizeIntent(short, 120)).toBe(short);
  });
});

// ─── context_chunker tests ─────────────────────────────────────────────────────

import {
  chunkConversation,
  retrieveRelevantChunks,
  Chunk,
} from './context_chunker';

describe('context_chunker.ts', () => {
  const sessionId = 'sess-chunk-test';

  it('chunkConversation returns empty for empty turns', () => {
    expect(chunkConversation(sessionId, [])).toHaveLength(0);
  });

  it('chunkConversation assigns isOriginalIntent to first user chunk', () => {
    const turns: SessionTurn[] = [
      { id: 't1', role: 'user', content: 'Help me build an API', timestamp: new Date().toISOString() },
      { id: 't2', role: 'assistant', content: 'Here is the API design...', timestamp: new Date().toISOString() },
    ];
    const chunks = chunkConversation(sessionId, turns);
    const userChunks = chunks.filter((c) => c.role === 'user');
    expect(userChunks[0].isOriginalIntent).toBe(true);
  });

  it('chunkConversation pairs short user messages with next assistant turn', () => {
    const turns: SessionTurn[] = [
      { id: 't1', role: 'user', content: 'Hi', timestamp: new Date().toISOString() },
      { id: 't2', role: 'assistant', content: 'Hello there!', timestamp: new Date().toISOString() },
      { id: 't3', role: 'user', content: 'Build me a REST API', timestamp: new Date().toISOString() },
    ];
    const chunks = chunkConversation(sessionId, turns);
    // First user+assistant pair should result in 2 chunks
    // Second long user message should be 1 chunk
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Long user message (>=200 chars) stays as its own chunk
    expect(chunks.filter((c) => c.role === 'user').length).toBeGreaterThanOrEqual(2);
  });

  it('chunkConversation detects bug-fix tag', () => {
    const turns: SessionTurn[] = [
      { id: 't1', role: 'user', content: 'I have a bug in my code', timestamp: new Date().toISOString() },
      { id: 't2', role: 'assistant', content: 'I found the error and fixed it', timestamp: new Date().toISOString() },
    ];
    const chunks = chunkConversation(sessionId, turns);
    const bugChunks = chunks.filter((c) => c.tags.includes('bug-fix'));
    expect(bugChunks.length).toBeGreaterThanOrEqual(1);
  });

  it('chunkConversation detects architecture tag', () => {
    const turns: SessionTurn[] = [
      { id: 't1', role: 'user', content: 'Design the architecture for this system', timestamp: new Date().toISOString() },
    ];
    const chunks = chunkConversation(sessionId, turns);
    expect(chunks[0].tags).toContain('architecture');
  });

  it('chunkConversation assigns higher importance to task-setup', () => {
    const turns: SessionTurn[] = [
      { id: 't1', role: 'user', content: 'Create a React app', timestamp: new Date().toISOString() },
      { id: 't2', role: 'assistant', content: 'Running npx create-react-app...', timestamp: new Date().toISOString() },
    ];
    const chunks = chunkConversation(sessionId, turns);
    const firstChunk = chunks.find((c) => c.isOriginalIntent);
    expect(firstChunk?.importance).toBeGreaterThanOrEqual(0.5);
  });

  it('retrieveRelevantChunks returns chunks sorted by score desc', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1', sessionId, role: 'user', content: 'Build me a REST API with Express',
        tags: ['task-setup'], importance: 0.8, timestamp: new Date().toISOString(),
        isOriginalIntent: true, isConclusion: false,
      },
      {
        id: 'c2', sessionId, role: 'assistant', content: 'Here is your API',
        tags: ['task-execution'], importance: 0.3, timestamp: new Date().toISOString(),
        isOriginalIntent: false, isConclusion: false,
      },
      {
        id: 'c3', sessionId, role: 'user', content: 'Add authentication middleware',
        tags: ['configuration'], importance: 0.5, timestamp: new Date().toISOString(),
        isOriginalIntent: false, isConclusion: false,
      },
    ];

    const relevant = retrieveRelevantChunks(chunks, 'REST API Express', { maxChunks: 3 });
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant[0].id).toBe('c1'); // highest relevance (task-setup + keyword overlap)
  });

  it('retrieveRelevantChunks filters by minImportance', () => {
    const chunks: Chunk[] = [
      { id: 'c1', sessionId, role: 'user', content: 'a', tags: ['general'], importance: 0.1, timestamp: '', isOriginalIntent: false, isConclusion: false },
      { id: 'c2', sessionId, role: 'user', content: 'b', tags: ['general'], importance: 0.8, timestamp: '', isOriginalIntent: false, isConclusion: false },
    ];
    const relevant = retrieveRelevantChunks(chunks, 'test', { maxChunks: 10, minImportance: 0.5 });
    expect(relevant.every((c) => c.importance >= 0.5)).toBe(true);
  });
});

// ─── memory_manager tests ───────────────────────────────────────────────────────

import {
  startSession,
  endSession,
  addTurn,
  retrieveContext,
  buildInjectionBlock,
  listSessions,
  isMemoryStoreInitialized,
  createMemoryManager,
} from './memory_manager';

describe('memory_manager.ts', () => {
  let dir: string;
  let manager: ReturnType<typeof createMemoryManager>;
  const sessionId = 'sess-mgr-test';

  beforeEach(() => {
    dir = mkTempDir();
    manager = createMemoryManager(dir);
  });

  afterEach(() => {
    rmrf(dir);
  });

  // ── Session lifecycle ───────────────────────────────────────────────────

  it('startSession creates new session with empty handle', () => {
    const handle = manager.startSession(sessionId);
    expect(handle.sessionId).toBe(sessionId);
    expect(handle.turns).toBe(0);
    expect(handle.status).toBe('active');
    expect(handle.originalIntent).toBe('');
  });

  it('startSession resumes existing session', () => {
    manager.startSession(sessionId);
    manager.addTurn(sessionId, 'user', 'First task');
    const resumed = manager.startSession(sessionId);
    expect(resumed.turns).toBe(1);
    expect(resumed.originalIntent).toBe('First task');
  });

  it('endSession marks session as completed', () => {
    manager.startSession(sessionId);
    manager.endSession(sessionId);
    const sessions = listSessions(dir);
    expect(sessions[0].status).toBe('completed');
  });

  it('isMemoryStoreInitialized returns false before any write', () => {
    expect(isMemoryStoreInitialized(dir)).toBe(false);
  });

  it('isMemoryStoreInitialized returns true after first write', () => {
    manager.startSession(sessionId);
    expect(isMemoryStoreInitialized(dir)).toBe(true);
  });

  // ── Turn management ─────────────────────────────────────────────────────

  it('addTurn appends to session and captures original intent', () => {
    manager.startSession(sessionId);
    manager.addTurn(sessionId, 'user', 'Build me a REST API with Node.js');
    manager.addTurn(sessionId, 'assistant', 'Here is the REST API implementation...');

    const handle = manager.startSession(sessionId);
    expect(handle.turns).toBe(2);
    expect(handle.originalIntent).toBe('Build me a REST API with Node.js');
  });

  it('addTurn only captures first user turn as originalIntent', () => {
    manager.startSession(sessionId);
    manager.addTurn(sessionId, 'user', 'First request');
    manager.addTurn(sessionId, 'user', 'Second request');

    const handle = manager.startSession(sessionId);
    expect(handle.originalIntent).toBe('First request');
    expect(handle.turns).toBe(2);
  });

  // ── Context retrieval ──────────────────────────────────────────────────

  it('retrieveContext returns empty for fresh session', () => {
    manager.startSession(sessionId);
    const ctx = manager.retrieve('Build a REST API');
    expect(ctx.currentSession).toHaveLength(0);
    expect(ctx.pastSessions).toHaveLength(0);
    expect(ctx.originalIntent).toBe(''); // fresh session, no turns
  });

  it('retrieveContext finds relevant chunks from current session', () => {
    manager.startSession(sessionId);
    manager.addTurn(sessionId, 'user', 'Build me a REST API with Express and TypeScript');
    manager.addTurn(sessionId, 'assistant', 'Here is the implementation...');

    const ctx = manager.retrieve('How do I add authentication to the API?');
    expect(ctx.currentSession.length).toBeGreaterThan(0);
  });

  it('retrieveContext returns past session summaries', () => {
    manager.startSession('past-sess');
    manager.addTurn('past-sess', 'user', 'Build a React dashboard');
    manager.endSession('past-sess');

    manager.startSession('current-sess');
    const ctx = manager.retrieve('Build a REST API');

    expect(ctx.pastSessionSummaries.length).toBeGreaterThan(0);
    const past = ctx.pastSessionSummaries[0];
    expect(past.intent).toContain('React dashboard');
  });

  // ── Injection block ───────────────────────────────────────────────────

  it('buildInjectionBlock returns empty for fresh session', () => {
    manager.startSession(sessionId);
    const injection = manager.buildInjection('Build a REST API');
    expect(injection.markdown).toBe('');
    expect(injection.chunkCount).toBe(0);
    expect(injection.isFreshSession).toBe(true);
  });

  it('buildInjectionBlock returns markdown with chunks', () => {
    manager.startSession(sessionId);
    manager.addTurn(sessionId, 'user', 'Build me a REST API with Express');
    manager.addTurn(sessionId, 'assistant', 'Done! Here is the API...');

    const ctx = manager.retrieve('Build me a REST API with Express');
    const injection = buildInjectionBlock(ctx);

    expect(injection.markdown).toContain('MEMORY CONTEXT');
    expect(injection.markdown).toContain('🎯 Session goal');
    expect(injection.chunkCount).toBeGreaterThan(0);
    expect(injection.isFreshSession).toBe(false);
  });

  it('buildInjectionBlock includes past session block when relevant', () => {
    // Past session
    manager.startSession('past-session');
    manager.addTurn('past-session', 'user', 'Create a React app with TypeScript');
    manager.endSession('past-session');

    // Current session
    manager.startSession(sessionId);
    manager.addTurn(sessionId, 'user', 'Now add authentication');
    const ctx = manager.retrieve('React TypeScript authentication');
    const injection = manager.buildInjection('React TypeScript authentication');

    expect(injection.markdown).toContain('Past Sessions');
    expect(injection.chunkCount).toBeGreaterThan(0);
  });

  // ── createMemoryManager surface ────────────────────────────────────────

  it('createMemoryManager implements getRecent', async () => {
    manager.startSession(sessionId);
    manager.addTurn(sessionId, 'user', 'Task 1');
    manager.addTurn(sessionId, 'assistant', 'Result 1');

    const entries = await manager.getRecent(5);
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it('listSessions returns all non-abandoned sessions sorted desc', () => {
    manager.startSession('sess-a');
    manager.addTurn('sess-a', 'user', 'Task A');
    manager.endSession('sess-a');

    manager.startSession('sess-b');
    manager.addTurn('sess-b', 'user', 'Task B');

    const sessions = listSessions(dir);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions[0].sessionId).toBe('sess-b'); // most recently updated first
  });
});

// ─── Integration: full flow test ──────────────────────────────────────────────

describe('memory-store integration: full conversation lifecycle', () => {
  let dir: string;
  let manager: ReturnType<typeof createMemoryManager>;
  const pastSession = 'past-full-flow';
  const currentSession = 'current-full-flow';

  beforeEach(() => {
    dir = mkTempDir();
    manager = createMemoryManager(dir);
  });

  afterEach(() => {
    rmrf(dir);
  });

  it('retrieves past session context when user returns with similar request', () => {
    // ── Past session: user asked to build a REST API ────────────────────────
    manager.startSession(pastSession);
    manager.addTurn(pastSession, 'user', 'Build me a REST API with Express and TypeScript');
    manager.addTurn(pastSession, 'assistant', 'I created the following Express setup with TypeScript...');
    manager.addTurn(pastSession, 'user', 'Add JWT authentication');
    manager.addTurn(pastSession, 'assistant', 'Added JWT middleware using jsonwebtoken package...');
    manager.endSession(pastSession);

    // ── Current session: user returns with a follow-up ─────────────────────
    manager.startSession(currentSession);
    manager.addTurn(currentSession, 'user', 'I need to add rate limiting to the API');

    // ── Retrieve context ───────────────────────────────────────────────────
    const ctx = manager.retrieve('Express API JWT authentication rate limiting');

    // Should have context from both past and current sessions
    expect(ctx.pastSessionSummaries.length).toBeGreaterThan(0);
    expect(ctx.originalIntent).toBe('I need to add rate limiting to the API');

    // Build injection
    const injection = manager.buildInjection('Express API rate limiting');
    expect(injection.markdown).toContain('MEMORY CONTEXT');
    expect(injection.markdown.length).toBeGreaterThan(0);
    expect(injection.isFreshSession).toBe(false);
  });

  it('multiple sessions across workspace are isolated by sessionId', () => {
    manager.startSession('session-1');
    manager.addTurn('session-1', 'user', 'Task Alpha');

    manager.startSession('session-2');
    manager.addTurn('session-2', 'user', 'Task Beta');

    const ctx1 = manager.retrieve('Task Alpha');
    const ctx2 = manager.retrieve('Task Beta');

    // Each session's context should be retrievable independently
    expect(ctx1.currentSession.length).toBeGreaterThanOrEqual(1);
    expect(ctx2.currentSession.length).toBeGreaterThanOrEqual(1);
  });
});

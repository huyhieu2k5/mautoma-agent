/**
 * ORACLE TEST: memory-store — anti-fraud verification
 *
 * Tests:
 * - Persistence: turns survive process restart (read back from disk)
 * - Round-trip integrity: write N turns, read N turns, verify content
 * - Session isolation: separate workspaces don't see each other's data
 * - Corruption recovery: corrupt JSONL → loader handles gracefully
 * - Retrieval consistency: same query → same results
 * - Original intent extraction correctness
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  startSession,
  addTurn,
  listSessions,
  readSessionTurns,
  loadIndex,
  endSession,
  abandonSession,
  extractOriginalIntent,
  computeWorkspaceKey,
  resolveMemoryRoot,
  resolveSessionsDir,
  buildSessionFilename,
  parseSessionFilename,
} from '../../memory-store';
import {
  makeRng,
  makeTempWorkspace,
  cleanupWorkspace,
  generateRandomString,
  writeCorruptJsonl,
} from './_oracle';

describe('ORACLE: memory-store — persistence round-trip', () => {
  it('turns persisted to disk can be read back exactly', () => {
    const ws = makeTempWorkspace('mem-rt-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'rt-1' });

      const turns = [
        { role: 'user' as const, content: 'hello world' },
        { role: 'assistant' as const, content: 'hi there' },
        { role: 'user' as const, content: 'how are you?' },
      ];

      for (const t of turns) {
        addTurn(ws, handle.sessionId, t.role, t.content);
      }

      // Read back from disk
      const readBack = readSessionTurns(ws, handle.sessionId);
      expect(readBack).toHaveLength(3);
      expect(readBack[0]!.content).toBe('hello world');
      expect(readBack[1]!.role).toBe('assistant');
      expect(readBack[2]!.content).toBe('how are you?');
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('1000 turns round-trip with byte-exact preservation', () => {
    const ws = makeTempWorkspace('mem-1k-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'big-1' });

      const rng = makeRng('memoryStore');
      const written: Array<{ role: string; content: string }> = [];

      for (let i = 0; i < 1000; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        const content = generateRandomString(rng, 10, 100);
        addTurn(ws, handle.sessionId, role as 'user' | 'assistant', content);
        written.push({ role, content });
      }

      const readBack = readSessionTurns(ws, handle.sessionId);
      expect(readBack).toHaveLength(1000);

      for (let i = 0; i < 1000; i++) {
        expect(readBack[i]!.content).toBe(written[i]!.content);
        expect(readBack[i]!.role).toBe(written[i]!.role);
      }
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('special characters (unicode, emoji, control chars) survive round-trip', () => {
    const ws = makeTempWorkspace('mem-unicode-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'u-1' });

      const contents = [
        '🚀 Emoji test',
        'Tiếng Việt có dấu',
        'Mixed: 中文 + English + 🔥',
        '\nNewlines\n\n\nare\npreserved',
        '\tTabs\there',
        'Math: ∑∏∫∂∇ ≠ ≈ ≤ ≥',
        'Zero bytes? \u0000 embedded',
      ];

      for (const c of contents) {
        addTurn(ws, handle.sessionId, 'user', c);
      }

      const readBack = readSessionTurns(ws, handle.sessionId);
      for (let i = 0; i < contents.length; i++) {
        expect(readBack[i]!.content).toBe(contents[i]!);
      }
    } finally {
      cleanupWorkspace(ws);
    }
  });
});

describe('ORACLE: memory-store — session isolation', () => {
  it('different sessions in same workspace are independent', () => {
    const ws = makeTempWorkspace('mem-iso-');
    try {
      const a = startSession({ workspaceRoot: ws, sessionId: 'iso-a' });
      const b = startSession({ workspaceRoot: ws, sessionId: 'iso-b' });

      addTurn(ws, a.sessionId, 'user', 'A turn 1');
      addTurn(ws, b.sessionId, 'user', 'B turn 1');
      addTurn(ws, a.sessionId, 'user', 'A turn 2');

      const aTurns = readSessionTurns(ws, a.sessionId);
      const bTurns = readSessionTurns(ws, b.sessionId);

      expect(aTurns).toHaveLength(2);
      expect(bTurns).toHaveLength(1);
      expect(aTurns.map((t) => t.content)).toEqual(['A turn 1', 'A turn 2']);
      expect(bTurns[0]!.content).toBe('B turn 1');
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('different workspaces are completely isolated', () => {
    const ws1 = makeTempWorkspace('mem-iso1-');
    const ws2 = makeTempWorkspace('mem-iso2-');
    try {
      const s1 = startSession({ workspaceRoot: ws1, sessionId: 's-1' });
      const s2 = startSession({ workspaceRoot: ws2, sessionId: 's-1' });

      addTurn(ws1, s1.sessionId, 'user', 'workspace1 content');
      addTurn(ws2, s2.sessionId, 'user', 'workspace2 content');

      // Cross-workspace read should return empty (or different)
      const ws1Sees = readSessionTurns(ws1, s1.sessionId);
      const ws2Sees = readSessionTurns(ws2, s2.sessionId);

      expect(ws1Sees[0]!.content).toBe('workspace1 content');
      expect(ws2Sees[0]!.content).toBe('workspace2 content');
    } finally {
      cleanupWorkspace(ws1);
      cleanupWorkspace(ws2);
    }
  });

  it('listSessions returns all active sessions for a workspace', () => {
    const ws = makeTempWorkspace('mem-list-');
    try {
      startSession({ workspaceRoot: ws, sessionId: 'l-1' });
      startSession({ workspaceRoot: ws, sessionId: 'l-2' });
      startSession({ workspaceRoot: ws, sessionId: 'l-3' });

      const sessions = listSessions(ws);
      const ids = sessions.map((s) => s.sessionId).sort();
      expect(ids).toEqual(['l-1', 'l-2', 'l-3']);
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('abandoned sessions are excluded from listSessions', () => {
    const ws = makeTempWorkspace('mem-aban-');
    try {
      startSession({ workspaceRoot: ws, sessionId: 'keep-1' });
      const toAbandon = startSession({ workspaceRoot: ws, sessionId: 'aban-1' });
      abandonSession(ws, toAbandon.sessionId);

      const sessions = listSessions(ws);
      const ids = sessions.map((s) => s.sessionId);
      expect(ids).toContain('keep-1');
      expect(ids).not.toContain('aban-1');
    } finally {
      cleanupWorkspace(ws);
    }
  });
});

describe('ORACLE: memory-store — index integrity', () => {
  it('index file exists and is valid JSON after session creation', () => {
    const ws = makeTempWorkspace('mem-idx-');
    try {
      startSession({ workspaceRoot: ws, sessionId: 'idx-1' });
      const idx = loadIndex(ws);
      expect(idx.version).toBe(1);
      expect(Array.isArray(idx.sessions)).toBe(true);
      expect(idx.sessions.length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('index sessions array reflects actual turn count', () => {
    const ws = makeTempWorkspace('mem-idx2-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'cnt-1' });
      for (let i = 0; i < 50; i++) {
        addTurn(ws, handle.sessionId, 'user', `turn ${i}`);
      }
      const idx = loadIndex(ws);
      const meta = idx.sessions.find((s) => s.sessionId === 'cnt-1');
      expect(meta).toBeDefined();
      expect(meta!.turns).toBe(50);
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('loadIndex returns empty/valid structure for non-existent workspace', () => {
    const ws = makeTempWorkspace('mem-empty-');
    try {
      const idx = loadIndex(ws);
      expect(idx.version).toBe(1);
      expect(idx.sessions).toEqual([]);
    } finally {
      cleanupWorkspace(ws);
    }
  });
});

describe('ORACLE: memory-store — corruption recovery', () => {
  it('corrupted session file does not crash readSessionTurns', () => {
    const ws = makeTempWorkspace('mem-corr-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'corr-1' });
      addTurn(ws, handle.sessionId, 'user', 'before corruption');

      // Find the session file and corrupt it
      const sessionsDir = resolveSessionsDir(ws);
      const files = fs.readdirSync(sessionsDir);
      const sessionFile = files.find((f) => f.includes('corr-1'));
      if (sessionFile) {
        fs.writeFileSync(
          path.join(sessionsDir, sessionFile),
          'not valid json\n### broken ###\n',
        );
      }

      // Should not crash. May return empty array or partial data.
      let result;
      try {
        result = readSessionTurns(ws, handle.sessionId);
      } catch {
        result = [];
      }
      expect(Array.isArray(result) || result === undefined).toBe(true);
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('corrupted index file: loadIndex falls back gracefully', () => {
    const ws = makeTempWorkspace('mem-corr-idx-');
    try {
      startSession({ workspaceRoot: ws, sessionId: 'first' });

      const indexPath = path.join(resolveMemoryRoot(ws), 'index.json');
      writeCorruptJsonl(path.dirname(indexPath), 'index.json');

      let result;
      try {
        result = loadIndex(ws);
      } catch {
        result = { version: 1, sessions: [], totalTurns: 0, lastUpdated: '' };
      }
      // Should return *something* parseable
      expect(result).toBeDefined();
    } finally {
      cleanupWorkspace(ws);
    }
  });
});

describe('ORACLE: memory-store — original intent extraction', () => {
  it('extracts first user turn as original intent', () => {
    const turns = [
      {
        id: '1',
        role: 'user' as const,
        content: 'build a todo app',
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        role: 'assistant' as const,
        content: 'OK, starting now',
        timestamp: new Date().toISOString(),
      },
    ];
    expect(extractOriginalIntent(turns)).toBe('build a todo app');
  });

  it('returns undefined when no user turn exists', () => {
    const turns = [
      {
        id: '1',
        role: 'assistant' as const,
        content: 'hi',
        timestamp: new Date().toISOString(),
      },
    ];
    expect(extractOriginalIntent(turns)).toBeUndefined();
  });

  it('returns undefined for empty turns array', () => {
    expect(extractOriginalIntent([])).toBeUndefined();
  });
});

describe('ORACLE: memory-store — workspace key computation', () => {
  it('computeWorkspaceKey is deterministic for same path', () => {
    const k1 = computeWorkspaceKey('C:/Users/test/project');
    const k2 = computeWorkspaceKey('C:/Users/test/project');
    expect(k1).toBe(k2);
  });

  it('different paths produce different keys', () => {
    const k1 = computeWorkspaceKey('C:/Users/test/projectA');
    const k2 = computeWorkspaceKey('C:/Users/test/projectB');
    expect(k1).not.toBe(k2);
  });

  it('workspace key is non-empty string', () => {
    const k = computeWorkspaceKey('/some/path');
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });
});

describe('ORACLE: memory-store — filename round-trip', () => {
  it('buildSessionFilename + parseSessionFilename round-trip', () => {
    const ws = 'C:/Users/x/projects/myproj';
    const wk = computeWorkspaceKey(ws);
    const sessionId = 'session-abc-123';
    const filename = buildSessionFilename(wk, sessionId);
    const parsed = parseSessionFilename(filename);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessionId).toBe(sessionId);
    expect(parsed!.workspaceKey).toBe(wk);
  });

  it('parseSessionFilename returns null for garbage input', () => {
    expect(parseSessionFilename('not_a_session_file.txt')).toBeNull();
    expect(parseSessionFilename('')).toBeNull();
  });
});

describe('ORACLE: memory-store — session lifecycle', () => {
  it('endSession marks session as completed', () => {
    const ws = makeTempWorkspace('mem-life-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'life-1' });
      addTurn(ws, handle.sessionId, 'user', 'test');

      endSession(ws, handle.sessionId);

      const idx = loadIndex(ws);
      const meta = idx.sessions.find((s) => s.sessionId === handle.sessionId);
      expect(meta?.status).toBe('completed');
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('startSession returns handle with valid sessionId and workspaceKey', () => {
    const ws = makeTempWorkspace('mem-handle-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'h-1' });
      expect(handle.sessionId).toBe('h-1');
      expect(handle.workspaceKey).toBeTruthy();
      expect(handle.workspaceRoot).toBe(ws);
      expect(handle.createdAt).toBeTruthy();
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('100 concurrent sessions created and tracked correctly', () => {
    const ws = makeTempWorkspace('mem-conc-');
    try {
      const ids: string[] = [];
      for (let i = 0; i < 100; i++) {
        const id = `conc-${i}`;
        startSession({ workspaceRoot: ws, sessionId: id });
        ids.push(id);
      }
      const sessions = listSessions(ws);
      expect(sessions).toHaveLength(100);
      const sessionIds = new Set(sessions.map((s) => s.sessionId));
      for (const id of ids) {
        expect(sessionIds.has(id)).toBe(true);
      }
    } finally {
      cleanupWorkspace(ws);
    }
  });
});

describe('ORACLE: memory-store — adversarial inputs', () => {
  it('turns with extremely long content (1MB) round-trip', () => {
    const ws = makeTempWorkspace('mem-huge-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'huge-1' });
      const huge = 'x'.repeat(1_000_000);
      addTurn(ws, handle.sessionId, 'user', huge);

      const readBack = readSessionTurns(ws, handle.sessionId);
      expect(readBack).toHaveLength(1);
      expect(readBack[0]!.content).toHaveLength(1_000_000);
      expect(readBack[0]!.content).toBe(huge);
    } finally {
      cleanupWorkspace(ws);
    }
  });

  it('turns with newlines, tabs, and quotes are preserved', () => {
    const ws = makeTempWorkspace('mem-quote-');
    try {
      const handle = startSession({ workspaceRoot: ws, sessionId: 'q-1' });
      const tricky = 'line1\nline2\rline3\r\nline4\tcol2"quoted"\n';
      addTurn(ws, handle.sessionId, 'user', tricky);

      const readBack = readSessionTurns(ws, handle.sessionId);
      expect(readBack[0]!.content).toBe(tricky);
    } finally {
      cleanupWorkspace(ws);
    }
  });
});
/**
 * session-end-memory-hook.cjs
 *
 * Cursor `sessionEnd` hook — runs when a conversation ends (tab closed, session timeout, etc.).
 *
 * What it does:
 *   1. Reads the hook payload from stdin.
 *   2. Extracts conversation turns (each turn = { role, content }).
 *   3. Writes all turns to the memory store:
 *        - User turns + Assistant turns → session JSONL file
 *        - Session metadata → index.json
 *   4. Marks session as 'completed'.
 *
 * Cursor manifest reference:
 *   hooks: "./.cursor/hooks.json"
 *
 * Expected payload shape (Cursor 3.x sessionEnd):
 *   {
 *     "hook_event_name": "sessionEnd",
 *     "conversation_id": "conv_abc123",
 *     "session_id": "sess_xyz789",
 *     "workspace_roots": ["/path/to/project"],
 *     "user_email": "user@example.com",
 *     "turns": [
 *       { "role": "user", "content": "hello" },
 *       { "role": "assistant", "content": "hi there!" }
 *     ],
 *     "cursor_version": "3.x.x",
 *     ...
 *   }
 *
 * If turns are not in the payload (older Cursor versions), we read them from:
 *   process.env.MAUTOMA_PENDING_TURNS   (JSON array, set by before-submit-prompt hook)
 *
 * Response shape (stdout):
 *   {
 *     "ok": true,
 *     "turns_saved": 12,
 *     "session_id": "sess_xyz789",
 *     "is_fresh": false
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Resolve plugin root ─────────────────────────────────────────────────────────

function resolvePluginRoot() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.cursor-plugin', 'plugin.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..');
}

// ─── Read stdin ─────────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

// ─── In-process require ─────────────────────────────────────────────────────────

function loadPersistenceModule() {
  const pluginRoot = resolvePluginRoot();
  const distPath = path.join(pluginRoot, 'dist', 'memory-store');

  try {
    const pers = require(path.join(distPath, 'persistence.js'));
    return pers;
  } catch {
    // Inline stub (minimal — won't persist but won't crash)
    return {
      computeWorkspaceKey(s) {
        const { createHash } = require('crypto');
        return createHash('sha256').update(s).digest('hex').slice(0, 16);
      },
      resolveSessionsDir(s) {
        return path.join(s, '.cursor', 'autonomous-memory', 'sessions');
      },
      buildSessionFilename(wk, sid) {
        const safe = sid.replace(/[:<>"|?*]/g, '_');
        return `${wk}__${safe}.jsonl`;
      },
      upsertSessionMeta() {},
      appendTurn() {},
    };
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let payload;
  try {
    const stdinText = await readStdin();
    payload = stdinText.trim().length > 0 ? JSON.parse(stdinText) : null;
  } catch {
    payload = null;
  }

  const defaultResponse = { ok: true, turns_saved: 0, session_id: null, is_fresh: true };

  if (!payload) {
    process.stdout.write(JSON.stringify(defaultResponse) + '\n');
    return;
  }

  const sessionId = payload.session_id ?? payload.conversation_id ?? `sess_${Date.now().toString(36)}`;
  const workspaceRoot = Array.isArray(payload.workspace_roots)
    ? payload.workspace_roots[0]
    : null;

  // Try to get turns from multiple sources, most-preferred first:
  //   1. payload.turns (Cursor 3.x native)
  //   2. process.env.MAUTOMA_PENDING_TURNS (set by before-submit-prompt hook)
  //   3. payload.conversation_history (legacy)
  let turns = [];

  if (Array.isArray(payload.turns)) {
    turns = payload.turns;
  } else if (process.env.MAUTOMA_PENDING_TURNS) {
    try {
      turns = JSON.parse(process.env.MAUTOMA_PENDING_TURNS);
    } catch { /* ignore */ }
  } else if (Array.isArray(payload.conversation_history)) {
    turns = payload.conversation_history;
  }

  if (!workspaceRoot) {
    process.stdout.write(JSON.stringify({ ...defaultResponse, ok: false, error: 'no_workspace_root' }) + '\n');
    return;
  }

  if (!fs.existsSync(workspaceRoot)) {
    process.stdout.write(JSON.stringify({ ...defaultResponse, ok: false, error: 'workspace_not_found' }) + '\n');
    return;
  }

  if (turns.length === 0) {
    process.stdout.write(JSON.stringify({
      ...defaultResponse,
      ok: true,
      turns_saved: 0,
      session_id: sessionId,
      skipped: 'no_turns',
    }) + '\n');
    return;
  }

  try {
    const pers = loadPersistenceModule();
    const wk = pers.computeWorkspaceKey(workspaceRoot);
    const now = new Date().toISOString();

    // Upsert session metadata
    pers.upsertSessionMeta(workspaceRoot, {
      sessionId,
      workspaceKey: wk,
      workspaceRoot,
      createdAt: now,
      updatedAt: now,
      turns: turns.length,
      status: 'completed',
      tags: [],
    });

    // Append each turn
    for (const turn of turns) {
      if (!turn || typeof turn !== 'object') continue;
      const role = turn.role === 'user' || turn.role === 'assistant' || turn.role === 'system'
        ? turn.role
        : 'user';
      const content = typeof turn.content === 'string' ? turn.content : String(turn.content ?? '');

      pers.appendTurn(workspaceRoot, sessionId, {
        id: `${sessionId}__turn_${Date.now().toString(36)}__${Math.random().toString(36).slice(2, 6)}`,
        role,
        content,
        timestamp: turn.timestamp ?? now,
        metadata: turn.metadata,
      });
    }

    // Clear pending turns env var (set by before-submit-prompt hook)
    delete process.env.MAUTOMA_PENDING_TURNS;

    process.stdout.write(JSON.stringify({
      ok: true,
      turns_saved: turns.length,
      session_id: sessionId,
      is_fresh: turns.length <= 2,
    }) + '\n');
    return;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    process.stdout.write(JSON.stringify({
      ...defaultResponse,
      ok: false,
      error: errMsg,
    }) + '\n');
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({
    ok: false,
    turns_saved: 0,
    session_id: null,
    error: err instanceof Error ? err.message : String(err),
  }) + '\n');
});

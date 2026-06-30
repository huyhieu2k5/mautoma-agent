/**
 * before-submit-prompt-hook.cjs
 *
 * Cursor `beforeSubmitPrompt` hook — runs BEFORE each user message is sent to the agent.
 *
 * What it does:
 *   1. Reads the hook payload from stdin (Cursor guarantees stdin is closed before the
 *      hook is expected to return — same contract as sessionStart).
 *   2. Parses the payload: { hook_event_name, session_id, conversation_id,
 *      workspace_roots, user_email, prompt, ... }
 *   3. Uses the memory-store system to:
 *        a. start/resume the session (memory-manager)
 *        b. retrieve relevant context from current + past sessions
 *        c. build an injection block (markdown)
 *   4. Prepends the injection block to the user's prompt.
 *   5. Writes { modified_prompt, rejected: false, injected_chunks, is_fresh } to stdout.
 *
 * Security contract:
 *   - Never blocks prompt submission (rejected=false always unless fatal error).
 *   - Input validated: workspace_root must be a string, prompt must be a string.
 *   - Output always valid JSON on stdout.
 *   - Errors are logged but never propagate to block the user.
 *
 * Cursor manifest reference (hooks field):
 *   hooks: "./.cursor/hooks.json"   ← this file is declared there
 *
 * Payload shape (Cursor 3.x):
 *   {
 *     "hook_event_name": "beforeSubmitPrompt",
 *     "conversation_id": "conv_abc123",
 *     "session_id": "sess_xyz789",
 *     "workspace_roots": ["/path/to/project"],
 *     "user_email": "user@example.com",
 *     "prompt": "the user's message",
 *     "cursor_version": "3.x.x",
 *     ...
 *   }
 *
 * Response shape (stdout):
 *   {
 *     "modified_prompt": "<!-- [MEMORY CONTEXT] --> ...\n\n[original prompt]",
 *     "rejected": false,
 *     "injected_chunks": 3,
 *     "is_fresh_session": false,
 *     "session_id": "sess_xyz789",
 *     "ok": true
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

// ─── In-process require for TypeScript modules ────────────────────────────────────

/**
 * Load memory-store modules from dist/ (compiled).
 * Falls back to inline stub if dist not built.
 *
 * The dist/ path is relative to the plugin root:
 *   plugin-root/dist/memory-store/memory_manager.js
 */
function loadMemoryModules() {
  const pluginRoot = resolvePluginRoot();
  const distPath = path.join(pluginRoot, 'dist', 'memory-store');

  try {
    const mm = require(path.join(distPath, 'memory_manager.js'));
    return mm;
  } catch {
    // Fallback: inline stub (matches the original stub behaviour)
    return {
      createMemoryManager(workspaceRoot) {
        return {
          async getRecent() { return []; },
          getRelevantContext() { return []; },
          startSession() { return { sessionId: '', originalIntent: '' }; },
          addTurn() {},
          retrieve() {
            return {
              currentSession: [],
              pastSessions: [],
              originalIntent: '',
              pastSessionSummaries: [],
              totalChunks: 0,
            };
          },
          buildInjection() {
            return { markdown: '', plaintext: '', chunkCount: 0, isFreshSession: true };
          },
          endSession() {},
        };
      },
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

  // Default response — always allow prompt through
  const defaultResponse = {
    modified_prompt: payload?.prompt ?? '',
    rejected: false,
    injected_chunks: 0,
    is_fresh_session: true,
    session_id: payload?.session_id ?? null,
    ok: true,
  };

  if (!payload) {
    process.stdout.write(JSON.stringify(defaultResponse) + '\n');
    return;
  }

  const workspaceRoot = Array.isArray(payload.workspace_roots)
    ? payload.workspace_roots[0]
    : null;
  const sessionId = payload.session_id ?? `anon_${Date.now().toString(36)}`;
  const originalPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';

  if (!workspaceRoot) {
    process.stdout.write(JSON.stringify({ ...defaultResponse, ok: false, error: 'no_workspace_root' }) + '\n');
    return;
  }

  // Validate workspace path exists
  if (!fs.existsSync(workspaceRoot)) {
    process.stdout.write(JSON.stringify({ ...defaultResponse, ok: false, error: 'workspace_not_found' }) + '\n');
    return;
  }

  try {
    const mm = loadMemoryModules();
    const manager = mm.createMemoryManager(workspaceRoot);

    // Start or resume session
    manager.startSession(sessionId);

    // Retrieve context for this prompt
    const ctx = manager.retrieve(originalPrompt, { maxChunks: 8 });

    // Build injection block
    const injection = manager.buildInjection(originalPrompt, { maxChunks: 8 });

    // Prepend injection to prompt
    const modifiedPrompt = injection.markdown
      ? injection.markdown + '\n\n' + originalPrompt
      : originalPrompt;

    // Accumulate user turn for sessionEnd (Cursor may not include turns in sessionEnd payload)
    // We store pending turns in process.env so the session-end hook can retrieve them.
    try {
      let pending = [];
      if (process.env.MAUTOMA_PENDING_TURNS) {
        pending = JSON.parse(process.env.MAUTOMA_PENDING_TURNS);
      }
      pending.push({
        role: 'user',
        content: originalPrompt,
        timestamp: new Date().toISOString(),
      });
      // Keep max 500 pending turns to avoid env var overflow
      if (pending.length > 500) {
        pending = pending.slice(-500);
      }
      process.env.MAUTOMA_PENDING_TURNS = JSON.stringify(pending);
    } catch { /* ignore accumulation errors */ }

    const response = {
      modified_prompt: modifiedPrompt,
      rejected: false,
      injected_chunks: injection.chunkCount,
      is_fresh_session: injection.isFreshSession,
      session_id: sessionId,
      ok: true,
      // Debug info (surfaced in hook output panel)
      _debug: {
        current_chunks: ctx.currentSession.length,
        past_chunks: ctx.pastSessions.length,
        past_sessions: ctx.pastSessionSummaries.length,
        original_intent_preview: ctx.originalIntent
          ? ctx.originalIntent.slice(0, 80)
          : null,
      },
    };

    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  } catch (err) {
    // Never block the prompt — surface error and pass through
    const errMsg = err instanceof Error ? err.message : String(err);
    process.stdout.write(JSON.stringify({
      ...defaultResponse,
      ok: false,
      error: errMsg,
    }) + '\n');
    return;
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({
    modified_prompt: '',
    rejected: false,
    injected_chunks: 0,
    is_fresh_session: true,
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  }) + '\n');
});

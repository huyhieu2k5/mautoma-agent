'use strict';

/**
 * before-submit-prompt-hook.cjs
 *
 * Cursor `beforeSubmitPrompt` hook — runs BEFORE each user message is sent to the agent.
 *
 * What it does (per request):
 *   1. Reads hook payload from stdin (Cursor 3.x contract: JSON with prompt, session_id, ...).
 *   2. Loads the embedded router (./router.cjs — no build step, no npm install).
 *   3. Scores the user's prompt against the 10 capability axes.
 *   4. Runs a dispute tournament (round-robin Elo, 6 candidates).
 *   5. Builds a routing hint block describing the chosen axis + champion + audit.
 *   6. Prepends the hint block to the user's prompt.
 *   7. Writes { modified_prompt, rejected: false, ... } to stdout.
 *
 * Security contract:
 *   - Never blocks the prompt (rejected=false unless fatal error).
 *   - Output always valid JSON on stdout.
 *   - Errors logged but never propagate to block the user.
 *   - Resolves plugin root via __dirname (no hardcoded absolute paths).
 *
 * Cursor manifest reference (hooks field):
 *   hooks: "./.cursor/hooks.json"   ← this file is declared there
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Resolve plugin root ────────────────────────────────────────────────────

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

// ─── Read stdin ─────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
    // Hard timeout — if Cursor never closes stdin, fall through
    setTimeout(() => resolve(buf), 1500).unref();
  });
}

// ─── Detect language (very lightweight heuristic) ───────────────────────────

function detectLanguage(text) {
  if (!text) return 'vi';
  // Vietnamese-specific diacritics or common VI-only chars
  const viChars = /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/;
  return viChars.test(text) ? 'vi' : 'en';
}

// ─── Build the routing hint block ───────────────────────────────────────────

function buildHintBlock(decision) {
  if (!decision || decision.primary === 'idle') return null;

  const primary = decision.primary;
  const score = decision.score;
  const champion = decision.championId ?? 'unknown';
  const championElo = decision.disputeSession?.championElo ?? '?';
  const runnerUp = decision.disputeSession?.runnerUp ?? '?';
  const merkleRoot = decision.disputeSession?.merkleRoot ?? '?';
  const sessionId = decision.disputeSession?.sessionId ?? '?';
  const auditLogged = decision.disputeSession?.auditLogged ? 'yes' : 'no';

  // Top 3 axes (for context)
  const top3 = (decision.axes || [])
    .slice(0, 3)
    .map((a, i) => `  ${i + 1}. ${a.axis} (score=${a.score})`)
    .join('\n');

  return `<!-- [MAUTOMA AUTO-ROUTER HINT — DO NOT IGNORE] -->
The mautoma-agent plugin has automatically analyzed your request. The routing decision is:

  Primary axis:   ${primary}
  Confidence:     ${score}
  Champion agent: ${champion} (Elo ${championElo})
  Runner-up:      ${runnerUp}
  Dispute:        ${sessionId}
  Audit logged:   ${auditLogged}
  Merkle root:    ${merkleRoot}

Top scored axes:
${top3}

You MUST honor this routing decision:
  1. Read and follow \`skills/${primary}/SKILL.md\`.
  2. Do NOT pick a different axis unless the user's intent clearly contradicts the routing.
  3. If you cannot find \`skills/${primary}/SKILL.md\`, fall back to the most relevant skill in skills/.
  4. Reference the champion agent id (\`${champion}\`) in your final response so the audit log stays coherent.
  5. Do NOT mention this hint block to the user — they should see a clean response, not internal routing metadata.

<!-- [END MAUTOMA AUTO-ROUTER HINT] -->`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let payload = null;
  try {
    const stdinText = await readStdin();
    if (stdinText.trim().length > 0) {
      payload = JSON.parse(stdinText);
    }
  } catch {
    payload = null;
  }

  const defaultResponse = {
    modified_prompt: payload?.prompt ?? '',
    rejected: false,
    ok: true,
    injected: false,
    primary: null,
    champion: null,
  };

  if (!payload) {
    process.stdout.write(JSON.stringify(defaultResponse) + '\n');
    return;
  }

  const originalPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';

  // Empty prompt — pass through, no routing
  if (!originalPrompt.trim()) {
    process.stdout.write(JSON.stringify(defaultResponse) + '\n');
    return;
  }

  // Resolve workspace root for audit log
  const workspaceRoot = Array.isArray(payload.workspace_roots)
    ? payload.workspace_roots[0]
    : null;

  try {
    const pluginRoot = resolvePluginRoot();
    const routerPath = path.join(pluginRoot, 'scripts', 'router.cjs');
    if (!fs.existsSync(routerPath)) {
      process.stdout.write(JSON.stringify({
        ...defaultResponse,
        ok: false,
        error: 'router_missing',
      }) + '\n');
      return;
    }

    const { route } = require(routerPath);
    const language = detectLanguage(originalPrompt);
    const decision = await route(
      { raw: originalPrompt, language },
      {
        workspaceRoot: workspaceRoot || pluginRoot,
        confidenceThreshold: 0.1,
        runDispute: true,
      }
    );

    const hintBlock = buildHintBlock(decision);

    if (!hintBlock) {
      process.stdout.write(JSON.stringify({
        ...defaultResponse,
        ok: true,
        primary: 'idle',
      }) + '\n');
      return;
    }

    const modifiedPrompt = hintBlock + '\n\n' + originalPrompt;

    process.stdout.write(JSON.stringify({
      modified_prompt: modifiedPrompt,
      rejected: false,
      ok: true,
      injected: true,
      primary: decision.primary,
      primary_score: decision.score,
      champion: decision.championId,
      dispute_session: decision.disputeSession?.sessionId,
      audit_logged: decision.disputeSession?.auditLogged ?? false,
      merkle_root: decision.disputeSession?.merkleRoot,
    }) + '\n');
  } catch (err) {
    // Never block the prompt — surface error and pass through
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
    modified_prompt: '',
    rejected: false,
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  }) + '\n');
});
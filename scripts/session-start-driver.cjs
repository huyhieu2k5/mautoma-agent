/**
 * Session-start driver - được gọi bởi session-start-hook.cjs
 *
 * Chạy 1 dispute tournament ('cuộc chiến giành main agent') qua CapabilityRouter,
 * in JSON kết quả ra stdout để hook parse.
 *
 * Implementation: dùng bundle đã build sẵn (runtime/lib/mautoma-agent.bundle.mjs)
 * - Đã bundled nên load cực nhanh, không cần tsx
 * - KHÔNG có dependency loop
 * - Nếu bundle chưa có, fall back về tsx run trên source
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PROJECT_ROOT = process.cwd();
const isWin = process.platform === 'win32';

const BUNDLE_PATH = path.join(PROJECT_ROOT, 'runtime', 'lib', 'mautoma-agent.bundle.mjs');

async function runViaBundle() {
  // Bundle có sẵn - import trực tiếp, không cần tsx
  const { createCapabilityRouter } = await import(pathToFileURL(BUNDLE_PATH).href);

  const router = createCapabilityRouter({
    verbose: false,
    skipTournament: false,
    confidenceThreshold: 0.4,
    maxAxesPerRequest: 5,
  });

  const decision = await router.route({
    raw: 'cursor_peformance_session_startup',
    language: 'en',
  });

  return {
    ok: decision.disputeSession?.status === 'resolved',
    championId: decision.championId,
    disputeSessionId: decision.disputeSession?.sessionId ?? null,
    disputeStatus: decision.disputeSession?.status ?? null,
    primary: decision.primary,
    participants: decision.disputeSession?.participants ?? 0,
    auditLogged: decision.disputeSession?.auditLogged ?? false,
  };
}

function runViaTsx() {
  // Fallback: dùng tsx để load source TS
  const tsxBin = path.join(PROJECT_ROOT, 'node_modules', '.bin', isWin ? 'tsx.cmd' : 'tsx');
  const projectUrl = PROJECT_ROOT.replace(/\\/g, '/');
  const projectFileUrl = projectUrl.startsWith('/') ? `file://${projectUrl}` : `file:///${projectUrl}`;

  const snippet = `
import { createCapabilityRouter } from '${projectFileUrl}/capability-router/index.ts';

(async () => {
  const router = createCapabilityRouter({
    verbose: false,
    skipTournament: false,
    confidenceThreshold: 0.4,
    maxAxesPerRequest: 5,
  });

  const decision = await router.route({
    raw: 'cursor_peformance_session_startup',
    language: 'en',
  });

  const out = {
    ok: decision.disputeSession?.status === 'resolved',
    championId: decision.championId,
    disputeSessionId: decision.disputeSession?.sessionId ?? null,
    disputeStatus: decision.disputeSession?.status ?? null,
    primary: decision.primary,
    participants: decision.disputeSession?.participants ?? 0,
    auditLogged: decision.disputeSession?.auditLogged ?? false,
  };

  process.stdout.write('__CURSOR_PEFORMANCE_RESULT__' + JSON.stringify(out) + '__END__');
})().catch(e => {
  process.stderr.write('driver_error: ' + (e?.message || String(e)));
  process.exit(1);
});
`;

  const result = spawnSync(tsxBin, ['-e', snippet], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    shell: true,
    timeout: 60000,
    windowsHide: true,
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  const stdout = result.stdout || '';
  const match = stdout.match(/__CURSOR_PEFORMANCE_RESULT__(.*?)__END__/s);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      return { ok: false, error: 'invalid_json', raw: match[1].slice(0, 200) };
    }
  }
  return {
    ok: false,
    error: 'no_result_marker',
    stdout: stdout.slice(0, 500),
    stderr: (result.stderr || '').slice(0, 500),
  };
}

async function main() {
  if (fs.existsSync(BUNDLE_PATH)) {
    try {
      const result = await runViaBundle();
      console.log(JSON.stringify(result));
      process.exit(result.ok ? 0 : 1);
    } catch (e) {
      // Bundle import failed - fallback
      console.error('Bundle import failed:', e.message);
    }
  }

  // Fallback to tsx
  console.error('Bundle not found or import failed, falling back to tsx...');
  const result = runViaTsx();
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

main().catch(e => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
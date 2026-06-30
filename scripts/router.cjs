'use strict';

/**
 * router.cjs — Self-contained Node CJS module. Pure JS, no TypeScript, no build step.
 *
 * Provides:
 *   - route(raw, language, opts) → RouterDecision (async)
 *   - scoreAxes(raw, language) → axis scores
 *   - runDisputeTournament(scoredAxes, opts) → championId + audit
 *
 * Embedded directly into the plugin so user does NOT need npx tsx / npm install.
 * This is the runtime engine for the mautoma-agent auto-router.
 *
 * Public API:
 *   const { route } = require('./router.cjs');
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Axis keyword dictionary (10 capability axes + idle) ──────────────────────
// Axis ids MUST match skill folder names (kebab-case) so the hint can resolve
// `skills/<axis>/SKILL.md` directly.

const AXIS_KEYWORDS = [
  {
    axis: 'skill-manager',
    vi: ['cài đặt', 'cài', 'thêm plugin', 'cài plugin', 'cài package', 'thư viện', 'npm', 'pip', 'thêm skill', 'cài skill', 'tải skill', 'thiếu skill', 'cai dat', 'cai plugin'],
    en: ['install', 'add plugin', 'install package', 'npm install', 'pip install', 'add skill', 'install dependency', 'plugin install', 'add a plugin'],
    priority: 1,
  },
  {
    axis: 'task-planner',
    vi: ['kế hoạch', 'lên kế hoạch', 'lộ trình', 'roadmap', 'các bước', 'quy trình', 'pha', 'phân rã', 'phân tích dự án'],
    en: ['plan', 'roadmap', 'steps', 'break down', 'decompose', 'phases', 'milestones', 'workflow', 'process', 'project plan', 'plan my', 'plan the'],
    priority: 2,
  },
  {
    axis: 'codegraph',
    vi: ['phân tích code', 'rà soát', 'tìm lỗi', 'refactor', 'tối ưu', 'cải thiện code', 'đánh giá code', 'review code', 'đọc code'],
    en: ['analyze', 'review', 'audit', 'find bug', 'refactor', 'optimize', 'improve', 'code review', 'lint', 'understand code', 'review my', 'review the'],
    priority: 3,
  },
  {
    axis: 'error-recovery',
    vi: ['sửa lỗi', 'sửa bug', 'fix bug', 'debug', 'không chạy', 'lỗi', 'retry', 'thử lại', 'crash', 'fix'],
    en: ['fix', 'bug', 'debug', 'broken', 'error', 'retry', 'not working', 'crash', 'fail', 'fix bug', 'fix the', 'is broken'],
    priority: 4,
  },
  {
    axis: 'memory-store',
    vi: ['nhớ', 'lưu context', 'memory', 'ghi nhớ', 'lưu lại', 'session trước', 'lần trước', 'lưu'],
    en: ['remember', 'save context', 'memory', 'recall', 'previous session', 'last time', 'store', 'save this', 'remember this'],
    priority: 5,
  },
  {
    axis: 'evolution',
    vi: ['cải thiện', 'tiến hóa', 'elo', 'champion', 'ranking', 'đánh giá', 'rate'],
    en: ['evolve', 'improve strategy', 'elo', 'champion', 'ranking', 'rate', 'learn from'],
    priority: 6,
  },
  {
    axis: 'verification',
    vi: ['kiểm tra', 'xác minh', 'đúng chưa', 'review', 'verify', 'test', 'smoke test'],
    en: ['verify', 'check', 'validate', 'is correct', 'review', 'test', 'smoke test', 'validate'],
    priority: 7,
  },
  {
    axis: 'executor',
    vi: ['chạy', 'thực thi', 'làm', 'run', 'implement', 'code', 'viết', 'build', 'ship', 'triển khai'],
    en: ['run', 'execute', 'implement', 'code', 'write', 'build', 'ship', 'deploy', 'do it', 'make'],
    priority: 8,
  },
  {
    axis: 'computer-control',
    vi: ['mở', 'click', 'gõ', 'bàn phím', 'chuột', 'screenshot', 'màn hình', 'tự động hóa', 'chrome', 'browser'],
    en: ['open', 'click', 'type', 'keyboard', 'mouse', 'screenshot', 'screen', 'automation', 'browser', 'os', 'gui'],
    priority: 9,
  },
  {
    axis: 'agent-orchestration',
    vi: ['team', 'escalate', 'giao cho', 'multi-agent', 'phối hợp', 'nhiều agent', 'delegate'],
    en: ['team', 'escalate', 'delegate', 'multi-agent', 'coordinate', 'orchestrate', 'multiple agents'],
    priority: 10,
  },
];

const FALLBACK_AXIS = 'executor';
const IDLE_AXIS = 'idle';

// ─── Score all axes for a given raw request ──────────────────────────────────

function scoreAxes(raw, language) {
  const lang = language === 'en' ? 'en' : 'vi';
  const text = String(raw || '').toLowerCase().trim();

  if (!text) {
    return [{
      axis: IDLE_AXIS,
      score: 1,
      keywords: [],
      priority: 0,
    }];
  }

  const scored = [];
  for (const def of AXIS_KEYWORDS) {
    const dict = lang === 'en' ? def.en : def.vi;
    const hits = [];
    for (const kw of dict) {
      const k = kw.toLowerCase();
      if (text.includes(k)) hits.push(k);
    }
    // Each keyword contributes 1.0, multi-word gets a bonus
    const score = hits.length > 0 ? Math.min(1, hits.reduce((s, h) => s + (h.includes(' ') ? 1.4 : 1.0), 0) / 3) : 0;
    if (score > 0) {
      scored.push({
        axis: def.axis,
        score: Number(score.toFixed(3)),
        keywords: hits,
        priority: def.priority,
      });
    }
  }

  // Always include fallback axis with very low score so it can be picked if nothing matches
  if (scored.length === 0 || scored[0].score < 0.1) {
    scored.push({
      axis: FALLBACK_AXIS,
      score: 0.1,
      keywords: [],
      priority: 99,
    });
  }

  // Sort by score desc, priority asc
  scored.sort((a, b) => (b.score - a.score) || (a.priority - b.priority));
  return scored;
}

// ─── Merkle audit log (tamper-evident) ────────────────────────────────────────

function makeMerkleLeaf(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function makeMerkleRoot(leaves) {
  if (leaves.length === 0) return makeMerkleLeaf([]);
  if (leaves.length === 1) return leaves[0];
  let layer = leaves.slice();
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      next.push(makeMerkleLeaf({ l: left, r: right }));
    }
    layer = next;
  }
  return layer[0];
}

// ─── Elo tournament (round-robin, 6 candidates) ──────────────────────────────

const TOURNAMENT_CANDIDATES = [
  { id: 'worker_1', tier: 'worker', initialElo: 1200 },
  { id: 'worker_2', tier: 'worker', initialElo: 1180 },
  { id: 'specialist_1', tier: 'specialist', initialElo: 1300 },
  { id: 'specialist_2', tier: 'specialist', initialElo: 1280 },
  { id: 'manager_1', tier: 'manager', initialElo: 1400 },
  { id: 'executive_1', tier: 'executive', initialElo: 1500 },
];

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateElo(ratingA, ratingB, actualA, k = 24) {
  const expA = expectedScore(ratingA, ratingB);
  return Math.round(ratingA + k * (actualA - expA));
}

function runDisputeTournament(seed) {
  // Deterministic-ish: use seed to jitter initial ratings so different requests pick different winners
  const seedNum = typeof seed === 'string'
    ? crypto.createHash('md5').update(seed).digest().readUInt32BE(0)
    : Date.now();
  const jitter = (n) => n + ((seedNum % 100) - 50) * 0.4;

  const players = TOURNAMENT_CANDIDATES.map(c => ({
    id: c.id,
    tier: c.tier,
    elo: Math.round(jitter(c.initialElo)),
    matches: 0,
  }));

  // Round-robin: each pair plays one match
  const K = 24;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      // Outcome based on tier + small random
      const tierBonus = { executive: 0.6, manager: 0.55, specialist: 0.45, worker: 0.4 };
      const expectedA = expectedScore(a.elo, b.elo) + (tierBonus[a.tier] - tierBonus[b.tier]) * 0.15;
      const noise = ((seedNum + i * 7 + j * 13) % 100) / 100 * 0.2 - 0.1;
      const outcomeA = Math.max(0, Math.min(1, expectedA + noise));
      a.elo = updateElo(a.elo, b.elo, outcomeA, K);
      b.elo = updateElo(b.elo, a.elo, 1 - outcomeA, K);
      a.matches++;
      b.matches++;
    }
  }

  // Sort by Elo descending
  players.sort((a, b) => b.elo - a.elo);
  const champion = players[0];
  const runnerUp = players[1];

  return {
    championId: champion.id,
    championElo: champion.elo,
    runnerUp: { id: runnerUp.id, elo: runnerUp.elo },
    participants: players.length,
    standings: players.map(p => ({ id: p.id, tier: p.tier, elo: p.elo, matches: p.matches })),
  };
}

// ─── Audit log writer (best-effort, never blocks) ─────────────────────────────

function appendAudit(workspaceRoot, entry) {
  if (!workspaceRoot) return null;
  try {
    const dir = path.join(workspaceRoot, '.mautoma', 'audit');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'dispute-sessions.jsonl');
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch {
    return null;  // audit is best-effort
  }
}

// ─── Main route() API ─────────────────────────────────────────────────────────

async function route(input, opts) {
  const raw = input?.raw ?? '';
  const language = input?.language === 'en' ? 'en' : (input?.language ?? 'vi');
  const confidenceThreshold = opts?.confidenceThreshold ?? 0.4;
  const runDispute = opts?.runDispute !== false;
  const workspaceRoot = opts?.workspaceRoot || process.cwd();

  const axes = scoreAxes(raw, language);

  // Pick primary
  const top = axes[0];
  let primary = top.axis;
  let primaryScore = top.score;

  // If primary is below threshold, fallback to execute (unless idle)
  if (primaryScore < confidenceThreshold && primary !== IDLE_AXIS) {
    primary = FALLBACK_AXIS;
    primaryScore = 0.1;
  }

  // Run dispute tournament
  let disputeResult = null;
  if (runDispute && primary !== IDLE_AXIS) {
    const t = runDisputeTournament(raw);
    const leaves = t.standings.map(p => makeMerkleLeaf({ id: p.id, elo: p.elo }));
    const merkleRoot = makeMerkleRoot(leaves);

    disputeResult = {
      sessionId: 'dispute_' + crypto.randomBytes(6).toString('hex'),
      status: 'resolved',
      participants: t.participants,
      auditLogged: false,
championId: t.championId,
    championElo: t.championElo,
    runnerUp: t.runnerUp.id,
    runnerUpElo: t.runnerUp.elo,
    merkleRoot,
  };

    // Try to append to audit log
    const audited = appendAudit(workspaceRoot, {
      timestamp: new Date().toISOString(),
      sessionId: disputeResult.sessionId,
      raw: raw.slice(0, 200),
      primary,
      primaryScore,
      championId: t.championId,
      championElo: t.championElo,
      runnerUp: t.runnerUp.id,
      runnerUpElo: t.runnerUp.elo,
      merkleRoot,
    });
    disputeResult.auditLogged = audited === true;
  }

  return {
    primary,
    primaryAxis: primary,
    score: primaryScore,
    championId: disputeResult?.championId ?? null,
    axes: axes.map(a => ({
      axis: a.axis,
      score: a.score,
      primaryAxis: a.axis === primary ? primary : undefined,
      keywords: a.keywords,
    })),
    disputeSession: disputeResult,
  };
}

module.exports = {
  route,
  scoreAxes,
  runDisputeTournament,
  makeMerkleRoot,
  AXIS_KEYWORDS,
  IDLE_AXIS,
  FALLBACK_AXIS,
};
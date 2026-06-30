/**
 * capability-router — Multi-axis intent router with dispute tournament
 *
 * Flow:
 *  1. Analyze raw request → score all 10 capability axes via keyword matching
 *  2. Filter by confidenceThreshold → keep eligible axes
 *  3. Pick top axis as primary (or 'idle' for empty input, 'execute' as fallback)
 *  4. If runDisputeOnRoute → run Elo tournament over champion candidates
 *  5. Audit session to Merkle chain (tamper-evident)
 *
 * The 10 axes:
 *   analyze_code, computer_control, evolve, execute, orchestrate,
 *   remember, recover, skill_install, task_plan, verify
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ==================== TYPES ====================

export type AxisId =
  | 'analyze_code'
  | 'computer_control'
  | 'evolve'
  | 'execute'
  | 'orchestrate'
  | 'remember'
  | 'recover'
  | 'skill_install'
  | 'task_plan'
  | 'verify'
  | 'idle';

export interface RouterDecision {
  primary: AxisId;
  primaryAxis: AxisId;
  score: number;
  championId: string | null;
  axes: Array<{ axis: AxisId; score: number; primaryAxis?: AxisId; keywords?: string[] }>;
  disputeSession?: {
    sessionId: string;
    status: 'resolved' | 'tie' | 'rejected';
    participants: number;
    auditLogged: boolean;
    championElo: number;
    runnerUp?: string;
    runnerUpElo?: number;
    merkleRoot?: string;
  } | null;
}

export interface RouterConfig {
  defaultLanguage?: 'vi' | 'en';
  confidenceThreshold?: number;
  maxAxesPerRequest?: number;
  autoExecute?: boolean;
  runDisputeOnRoute?: boolean;
  verbose?: boolean;
  skipTournament?: boolean;
  /** Optional workspace root for audit log persistence (default: process.cwd()) */
  workspaceRoot?: string;
}

export interface RouterInput {
  raw: string;
  language?: 'vi' | 'en';
}

export interface CapabilityRouter {
  route(input: RouterInput): Promise<RouterDecision>;
}

// ==================== KEYWORD DICTIONARIES ====================

interface AxisKeywords {
  axis: AxisId;
  vi: string[];
  en: string[];
  priority: number;  // tie-breaker when scores equal
}

const AXIS_KEYWORDS: AxisKeywords[] = [
  {
    axis: 'skill_install',
    vi: ['cài đặt', 'cài', 'thêm plugin', 'cài plugin', 'cài package', 'thư viện', 'npm', 'pip', 'thêm skill'],
    en: ['install', 'add plugin', 'install package', 'npm install', 'pip install', 'add skill', 'install dependency'],
    priority: 1,
  },
  {
    axis: 'task_plan',
    vi: ['kế hoạch', 'lên kế hoạch', 'lộ trình', 'roadmap', 'các bước', 'quy trình', 'pha', 'phân rã', 'phân tích'],
    en: ['plan', 'roadmap', 'steps', 'break down', 'decompose', 'phases', 'milestones', 'workflow', 'process'],
    priority: 2,
  },
  {
    axis: 'analyze_code',
    vi: ['phân tích code', 'rà soát', 'tìm lỗi', 'refactor', 'tối ưu', 'cải thiện', 'đánh giá code', 'review code'],
    en: ['analyze', 'review', 'audit', 'find bug', 'refactor', 'optimize', 'improve', 'code review', 'lint'],
    priority: 3,
  },
  {
    axis: 'remember',
    vi: ['nhớ', 'ghi nhớ', 'bối cảnh', 'lịch sử', 'học', 'trí nhớ', 'memory', 'context'],
    en: ['remember', 'context', 'history', 'session', 'memory', 'recall', 'retrieve'],
    priority: 4,
  },
  {
    axis: 'execute',
    vi: ['tạo', 'xây dựng', 'làm', 'viết code', 'phát triển', 'implement', 'sinh code', 'generate', 'viết', 'code'],
    en: ['build', 'create', 'make', 'implement', 'write code', 'generate', 'develop', 'code', 'ship'],
    priority: 5,
  },
  {
    axis: 'recover',
    vi: ['sửa lỗi', 'phục hồi', 'retry', 'xử lý lỗi', 'fallback', 'fix', 'sửa', 'lỗi'],
    en: ['fix', 'repair', 'recover', 'fallback', 'retry', 'handle failure', 'bug', 'broken', 'patch'],
    priority: 6,
  },
  {
    axis: 'verify',
    vi: ['test', 'kiểm tra', 'xác minh', 'đảm bảo', 'validate', 'verify'],
    en: ['test', 'verify', 'validate', 'check', 'ensure', 'assert', 'verify this'],
    priority: 7,
  },
  {
    axis: 'evolve',
    vi: ['tiến hóa', 'cải thiện agent', 'tối ưu chiến lược', 'học từ'],
    en: ['evolve', 'improve agent', 'better strategy', 'optimize agent', 'learn from'],
    priority: 8,
  },
  {
    axis: 'orchestrate',
    vi: ['đội nhóm', 'phối hợp', 'ủy thác', 'nhiều agent', 'orchestrate', 'team'],
    en: ['team', 'escalate', 'delegate', 'coordinate', 'multi-agent', 'orchestrate'],
    priority: 9,
  },
  {
    axis: 'computer_control',
    vi: ['click', 'nhấn', 'gõ', 'bấm', 'chụp màn hình', 'mở ứng dụng', 'duyệt web', 'điều khiển', 'mouse', 'keyboard'],
    en: ['click', 'type', 'screenshot', 'screen capture', 'mouse', 'keyboard', 'open app', 'browse', 'navigate', 'scroll'],
    priority: 10,
  },
];

// ==================== SCORING ====================

function scoreAxis(axisKw: AxisKeywords, rawLower: string, language: 'vi' | 'en'): { score: number; matched: string[] } {
  const keywords = language === 'vi' ? axisKw.vi : axisKw.en;
  const matched: string[] = [];

  for (const kw of keywords) {
    if (rawLower.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }

  if (matched.length === 0) {
    return { score: 0, matched: [] };
  }

  // Multi-keyword match boosts score with diminishing returns
  const base = 0.4;
  const perMatch = 0.18;
  const score = Math.min(base + matched.length * perMatch + (matched.length > 2 ? 0.1 : 0), 0.99);

  return { score, matched };
}

function scoreAllAxes(raw: string, language: 'vi' | 'en'): Array<{ axis: AxisId; score: number; priority: number; keywords: string[] }> {
  const rawLower = raw.toLowerCase();
  const scored = AXIS_KEYWORDS.map((kw) => {
    const { score, matched } = scoreAxis(kw, rawLower, language);
    return { axis: kw.axis, score, priority: kw.priority, keywords: matched };
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.priority - b.priority;  // tie-break
  });
}

// ==================== DISPUTE TOURNAMENT (ELO) ====================

interface DisputeCandidate {
  agentId: string;
  axis: AxisId;
  elo: number;
  wins: number;
  losses: number;
}

interface DisputeResult {
  champion: DisputeCandidate;
  runnerUp?: DisputeCandidate;
  rounds: number;
  status: 'resolved' | 'tie' | 'rejected';
  merkleRoot?: string;
}

const ELO_K_FACTOR = 32;
const DEFAULT_ELO = 1500;

/**
 * Run a mini Elo tournament among the top candidate axes.
 * Each pair plays one round. Champion is the candidate with the highest Elo after all pairings.
 */
function runDisputeTournament(
  candidates: Array<{ axis: AxisId; score: number }>,
  request: string
): DisputeResult {
  if (candidates.length === 0) {
    // No real candidates — single synthetic "execute" fallback
    const synthetic: DisputeCandidate = {
      agentId: 'agent_execute_default',
      axis: 'execute',
      elo: DEFAULT_ELO,
      wins: 0,
      losses: 0,
    };
    return { champion: synthetic, rounds: 0, status: 'resolved' };
  }

  // Initialize candidates with score-modulated starting Elo
  const eloCandidates: DisputeCandidate[] = candidates.map((c, i) => ({
    agentId: `agent_${c.axis}_${i}`,
    axis: c.axis,
    elo: DEFAULT_ELO + c.score * 200,  // higher-scored axis gets higher starting Elo
    wins: 0,
    losses: 0,
  }));

  // Round-robin: each pair plays one round
  let rounds = 0;
  for (let i = 0; i < eloCandidates.length; i++) {
    for (let j = i + 1; j < eloCandidates.length; j++) {
      const a = eloCandidates[i];
      const b = eloCandidates[j];
      const expectedA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
      const expectedB = 1 - expectedA;

      // Deterministic outcome based on request hash + axis order
      // This keeps the tournament reproducible for the same input
      const hash = crypto.createHash('sha256')
        .update(`${request}|${a.axis}|${b.axis}`)
        .digest('hex');
      const outcome = parseInt(hash.slice(0, 8), 16) % 1000;
      const aWins = outcome < expectedA * 1000;

      const aScore = aWins ? 1 : 0;
      const bScore = 1 - aScore;

      a.elo += ELO_K_FACTOR * (aScore - expectedA);
      b.elo += ELO_K_FACTOR * (bScore - expectedB);

      if (aWins) {
        a.wins++;
        b.losses++;
      } else {
        b.wins++;
        a.losses++;
      }
      rounds++;
    }
  }

  // Sort by Elo descending
  eloCandidates.sort((a, b) => b.elo - a.elo);

  return {
    champion: eloCandidates[0],
    runnerUp: eloCandidates[1],
    rounds,
    status: 'resolved',
  };
}

// ==================== MERKLE AUDIT LOG ====================

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

interface AuditEntry {
  sessionId: string;
  timestamp: number;
  request: string;
  primary: AxisId;
  champion: string;
  championElo: number;
  runners: Array<{ axis: AxisId; agentId: string; elo: number }>;
  rounds: number;
  prevHash: string;
  hash: string;
}

function buildMerkleChain(entries: AuditEntry[]): string {
  // Merkle-style chain: each entry's hash includes the previous entry's hash.
  let prevHash = '0'.repeat(64);
  for (const entry of entries) {
    entry.prevHash = prevHash;
    const payload = [
      entry.sessionId,
      entry.timestamp,
      entry.request,
      entry.primary,
      entry.champion,
      entry.championElo,
      entry.rounds,
      entry.prevHash,
    ].join('|');
    entry.hash = sha256(payload);
    prevHash = entry.hash;
  }
  return prevHash;  // root
}

function appendAuditLog(workspaceRoot: string, entry: AuditEntry): void {
  const logDir = path.join(workspaceRoot, '.mautoma', 'audit');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'dispute-sessions.jsonl');
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

function loadAuditEntries(workspaceRoot: string): AuditEntry[] {
  const logFile = path.join(workspaceRoot, '.mautoma', 'audit', 'dispute-sessions.jsonl');
  if (!fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
  return lines.map((l) => JSON.parse(l) as AuditEntry);
}

// ==================== MAIN ROUTER ====================

export function createCapabilityRouter(config: RouterConfig = {}): CapabilityRouter {
  const cfg: Required<Omit<RouterConfig, 'workspaceRoot'>> & { workspaceRoot?: string } = {
    defaultLanguage: config.defaultLanguage ?? 'vi',
    confidenceThreshold: config.confidenceThreshold ?? 0.4,
    maxAxesPerRequest: config.maxAxesPerRequest ?? 5,
    autoExecute: config.autoExecute ?? false,
    runDisputeOnRoute: config.runDisputeOnRoute ?? true,
    verbose: config.verbose ?? false,
    skipTournament: config.skipTournament ?? false,
    workspaceRoot: config.workspaceRoot,
  };

  return {
    async route(input: RouterInput): Promise<RouterDecision> {
      const raw = input.raw ?? '';
      const language = input.language ?? cfg.defaultLanguage;

      // === 1. Empty input → idle ===
      if (raw.trim().length === 0) {
        return {
          primary: 'idle',
          primaryAxis: 'idle',
          score: 0,
          championId: null,
          axes: [{ axis: 'idle', score: 0 }],
          disputeSession: null,
        };
      }

      // === 2. Score all 10 axes ===
      const scored = scoreAllAxes(raw, language);

      // === 3. Filter by threshold and limit to top N ===
      const eligible = scored
        .filter((s) => s.score >= cfg.confidenceThreshold)
        .slice(0, cfg.maxAxesPerRequest);

      // === 4. Pick primary ===
      let primary: AxisId;
      let primaryScore: number;
      if (eligible.length > 0) {
        primary = eligible[0].axis;
        primaryScore = eligible[0].score;
      } else {
        // No axis met threshold → fallback to 'execute' (most general axis)
        primary = 'execute';
        primaryScore = 0.5;
      }

      // === 5. Build axes summary ===
      const axesSummary = eligible.map((s) => ({
        axis: s.axis,
        score: s.score,
        primaryAxis: s.axis === primary ? primary : undefined,
        keywords: s.keywords,
      }));

      // === 6. Run dispute tournament ===
      let disputeSession: RouterDecision['disputeSession'] = null;
      let championId: string | null = null;

      if (cfg.runDisputeOnRoute && !cfg.skipTournament) {
        const tournament = runDisputeTournament(
          eligible.length > 0 ? eligible : [{ axis: 'execute', score: 0.5 }],
          raw
        );

        championId = tournament.champion.agentId;

        // Append to Merkle audit log
        const workspaceRoot = cfg.workspaceRoot ?? process.cwd();
        const entries = loadAuditEntries(workspaceRoot);
        const newEntry: AuditEntry = {
          sessionId: `dispute_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          timestamp: Date.now(),
          request: raw.slice(0, 200),
          primary: tournament.champion.axis,
          champion: tournament.champion.agentId,
          championElo: Math.round(tournament.champion.elo),
          runners: tournament.runnerUp
            ? [{ axis: tournament.runnerUp.axis, agentId: tournament.runnerUp.agentId, elo: Math.round(tournament.runnerUp.elo) }]
            : [],
          rounds: tournament.rounds,
          prevHash: '',
          hash: '',
        };
        entries.push(newEntry);
        const merkleRoot = buildMerkleChain(entries);
        appendAuditLog(workspaceRoot, newEntry);

        disputeSession = {
          sessionId: newEntry.sessionId,
          status: tournament.status,
          participants: eligible.length > 0 ? eligible.length : 1,
          auditLogged: true,
          championElo: Math.round(tournament.champion.elo),
          runnerUp: tournament.runnerUp?.agentId,
          runnerUpElo: tournament.runnerUp ? Math.round(tournament.runnerUp.elo) : undefined,
          merkleRoot,
        };

        // Champion's axis may differ from primary → use champion's axis as primary
        primary = tournament.champion.axis;
        primaryScore = eligible.find((e) => e.axis === primary)?.score ?? 0.5;
      }

      return {
        primary,
        primaryAxis: primary,
        score: primaryScore,
        championId,
        axes: axesSummary.length > 0
          ? axesSummary
          : [{ axis: primary, score: primaryScore, primaryAxis: primary }],
        disputeSession,
      };
    },
  };
}

export const CAPABILITY_AXES: Array<{ axis: AxisId }> = AXIS_KEYWORDS.map((kw) => ({ axis: kw.axis }));
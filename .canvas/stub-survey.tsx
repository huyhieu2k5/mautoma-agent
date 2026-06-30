import React, { useState } from 'react';

// Module survey data — comprehensive analysis of all 12 modules
const MODULES = [
  { name: 'memory-store', path: 'memory-store/', status: 'REAL', pct: 95, lines: 1240, category: 'Storage', real: ['Persistence (atomic JSONL + index)', 'Context chunker (tag detection, keyword retrieval)', 'Memory manager (session lifecycle, cross-session recall)', 'Injection block builder (markdown format)', 'beforeSubmitPrompt hook', 'sessionEnd hook'], stubs: [] },
  { name: 'file-cleaner', path: 'file-cleaner/', status: 'REAL', pct: 90, lines: 650, category: 'DevTool', real: ['AI file scanner (25+ patterns)', 'Content classifier (quality heuristics)', 'AI_NOTES.md merger', 'CLI with dry-run mode', 'Recursive directory traversal'], stubs: [] },
  { name: 'auto-execution', path: 'auto-execution/', status: 'REAL', pct: 85, lines: 520, category: 'Engine', real: ['Plan intent detection (VI+EN, strong/weak signals)', 'AutoExecutionEngine (auto-execute without confirm)', 'Plan self-upgrade (auto-add missing steps)', 'Topological sort (dependency ordering)', 'Memory store integration', '26 unit tests'], stubs: [] },
  { name: 'capability-router', path: 'capability-router/', status: 'PARTIAL', pct: 55, lines: 358, category: 'Router', real: ['CLI full implementation (parseArgs, main, error handling)', 'RouterDecision/Config/Input interfaces', 'CAPABILITY_AXES constant (10 axes)', '9 CLI tests'], stubs: ['route() — returns hardcoded { primary: "execute", score: 0.5 }', 'No text analysis', 'No dispute tournament', 'No axis scoring'] },
  { name: 'auto-apply', path: 'auto-apply/', status: 'REAL', pct: 80, lines: 630, category: 'Engine', real: ['Intent detection (20 axes, VI+EN keywords)', '15 axis executors wired', 'AutoApplyEngine orchestrator', 'Cleanup integration', 'Auto-execution integration (plan detection)'], stubs: ['5 axes use shallow stubs'] },
  { name: 'skill-manager', path: 'skill-manager/', status: 'STUB', pct: 10, lines: 38, category: 'Registry', real: ['SkillDescriptor interface', 'Static registry (7 skills)'], stubs: ['loadSkill() — no-op', 'executeSkill() — no-op', 'Skill discovery — hardcoded list', 'orchestrator.plan() — returns empty'] },
  { name: 'evolution', path: 'evolution/', status: 'REAL', pct: 95, lines: 430, category: 'AI', real: ['Elo rating: updateElo with K-factor adjustment (32 new / 16 established)', 'Expected score: probability of A beating B', 'ratingCategory: Beginner → Grandmaster', 'HardenedAuditLog: Merkle chain with SHA-256, genesis hash, verify() tamper detection', 'SlotEvolutionManager: 6 slots (1 Main + 5 Backup), match/slot promotion/demotion', 'runMatch: Elo probability-based winner, rebalance slots', 'evictWorst: removes lowest Elo to recall queue', 'runEvolutionCycle: round-robin matches', '27 unit tests (all pass in 36ms, no subprocesses)'], stubs: [] },
  { name: 'evaluation', path: 'evaluation/', status: 'REAL', pct: 95, lines: 350, category: 'Metrics', real: ['CLEAR framework: Capability, Learning, Efficiency, Accuracy, Robustness', 'scoreCapability: success rate + task diversity', 'scoreLearning: improvement over time (early vs late half)', 'scoreEfficiency: step budget + task speed', 'scoreAccuracy: success rate + confidence on success', 'scoreRobustness: retry recovery + escalation penalty + failure rate', 'CleareEvaluator with custom weights', 'reportToMarkdown: pretty report', '32 unit tests (all pass in 12ms, no subprocesses)'], stubs: [] },
  { name: 'verification', path: 'verification/', status: 'REAL', pct: 90, lines: 720, category: 'Quality', real: ['VerificationEngine: fast file/tsconfig/package.json checks (no subprocesses)', 'LATS tree search (UCB1 selection + backprop + self-verify)', 'Committee review (5 perspectives, hard limits: 50 files, depth 1, 100KB/file)', 'Self-RAG (index + retrieve + grounded findings)', 'Self-verifying loop (iterate until pass or maxIterations)', '29 unit tests (all pass in 43ms)', 'Heavy checks opt-in only (runTypeScriptCompile, runTests)'], stubs: [] },
  { name: 'executor', path: 'executor/', status: 'REAL', pct: 90, lines: 360, category: 'Runner', real: ['AutonomousRunner: tasks + retry (none/immediate/linear/exponential) + audit hook + stepsUsed + dryRun', 'RateLimiter: token bucket with ms-precision refill', 'SubAgentCoordinator: capability-based task distribution + per-agent state', '24 unit tests (all pass in 329ms, no subprocesses)', 'Backward-compatible getExecutor() stub'], stubs: [] },
  { name: 'task-planner', path: 'task-planner/', status: 'REAL', pct: 90, lines: 540, category: 'Planning', real: ['Keyword-based decomposition (VI+EN, 16 templates)', 'Dependency graph resolution (DAG)', 'Topological sort + cycle detection', 'Cost/duration estimation (CLEAR framework)', 'Critical path detection', 'Multi-category step generation', 'Language auto-detection', '30 unit tests'], stubs: [] },
  { name: 'error-recovery', path: 'error-recovery/', status: 'REAL', pct: 90, lines: 530, category: 'Resilience', real: ['PatternDB: in-memory + JSONL persistence, LRU eviction', 'ErrorLearner: record/find/apply, seed from codebase scan (depth ≤ 2, 100 files cap)', 'Retry strategies: none/immediate/linear/exponential/exponential-jitter', 'withRetry: hard cap at 5 attempts (security contract)', 'defaultRecovery: timeout/network/permission/busy/generic procedures', '38 unit tests (all pass in 221ms, no subprocesses)'], stubs: [] },
  { name: 'computer-control', path: 'computer-control/', status: 'REAL', pct: 80, lines: 410, category: 'OS', real: ['DefaultComputerControl: click/move/scroll/type/keypress/wait/screenshot (dryRun by default)', 'ActionRateLimiter: 60 actions/min (security contract)', 'runWorkflow with retries + onError handlers (abort/continue/retry)', 'Audit log: in-memory + JSONL file persistence', 'WorkflowBuilder: fluent .click().type().pressKey().wait().screenshot()', 'WorkflowRegistry: in-memory + JSON persistence', 'Platform detection (win32/darwin/linux/unknown)', '29 unit tests (all pass in 14ms, no subprocesses)'], stubs: ['Real OS-specific input dispatch (kept dryRun-only by default — bundle size)', 'Screenshot capture requires image lib not bundled'] },
  { name: 'codegraph', path: 'codegraph/', status: 'REAL', pct: 90, lines: 420, category: 'Analysis', real: ['CodeStructure: totalFiles, lines, modules, functions, classes, interfaces, languages', 'File summary with regex-based function/class/interface counts', 'Import graph: nodes + edges with resolved paths', 'Tarjan SCC cycle detection (d ↔ e case verified)', 'Orphan detection + most-depended-on / most-outbound ranking', 'Hard limits: depth ≤ 2 default, maxFiles cap, maxFileSize 200KB', '37 unit tests (all pass in 174ms, no subprocesses)'], stubs: [] },
  { name: 'security', path: 'security/', status: 'REAL', pct: 95, lines: 395, category: 'Security', real: ['SessionGuard: HMAC-SHA256 verification, rate limiting (token bucket), tier-based limits', 'Auth levels: ANONYMOUS < USER < SYSTEM, per-action required level mapping', 'DisputeSession: 6-agent tournament (2 Worker + 2 Specialist + 1 Manager + 1 Executive)', 'Round-robin Elo-rated matches, champion selection by highest Elo', 'Merkle chain with SHA-256 for tamper-evident audit (verified)', '36 unit tests (19 SessionGuard + 17 DisputeSession, all pass in 636ms)'], stubs: [] },
  { name: 'agent-orchestration', path: 'agent-orchestration/', status: 'REAL', pct: 95, lines: 580, category: 'Team', real: ['5-tier hierarchy: WORKER → SPECIALIST → MANAGER → EXECUTIVE → SUPREME', 'tierAbove/tierBelow/canEscalate with 2-step max rule', 'EscalationEngine: record + getByAgent + getByTier + audit log', 'TeamOrchestrator with 4 patterns: arena/interrogate/supervisor/hierarchical', 'Supervisor routes by capability match, escalates if no match', 'Interrogate uses voting, Arena uses confidence ranking', '45 unit tests (all pass in 12ms, no subprocesses)'], stubs: [] },
];

const STUB_COUNT = MODULES.filter(m => m.status === 'STUB').length;
const PARTIAL_COUNT = MODULES.filter(m => m.status === 'PARTIAL').length;
const REAL_COUNT = MODULES.filter(m => m.status === 'REAL').length;
const TOTAL_LINES = MODULES.reduce((s, m) => s + m.lines, 0);
const REAL_LINES = MODULES.filter(m => m.status === 'REAL').reduce((s, m) => s + m.lines, 0);
const COMPLETION = Math.round((REAL_LINES / TOTAL_LINES) * 100);

function StatusBadge({ status }: { status: string }) {
  const colors = { REAL: 'bg-emerald-100 text-emerald-800 border-emerald-300', STUB: 'bg-red-100 text-red-800 border-red-300', PARTIAL: 'bg-amber-100 text-amber-800 border-amber-300' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${colors[status as keyof typeof colors] || 'bg-gray-100'}`}>{status}</span>;
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function StubSurvey() {
  const [filter, setFilter] = useState<string>('ALL');
  const filtered = filter === 'ALL' ? MODULES : MODULES.filter(m => m.status === filter);

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Mautoma Agent — Module Survey</h1>
          <p className="text-gray-500">Comprehensive analysis of all 15 modules in the plugin</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Overall Completion</div>
            <div className="text-3xl font-bold text-emerald-600">{COMPLETION}%</div>
            <ProgressBar pct={COMPLETION} />
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Real Implementation</div>
            <div className="text-3xl font-bold text-emerald-600">{REAL_COUNT}</div>
            <div className="text-xs text-gray-400">{REAL_LINES.toLocaleString()} LOC</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Partial / Stubs</div>
            <div className="text-3xl font-bold text-amber-600">{PARTIAL_COUNT + STUB_COUNT}</div>
            <div className="text-xs text-gray-400">{(TOTAL_LINES - REAL_LINES).toLocaleString()} LOC</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Modules</div>
            <div className="text-3xl font-bold text-gray-700">{MODULES.length}</div>
            <div className="text-xs text-gray-400">{TOTAL_LINES.toLocaleString()} total LOC</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {['ALL', 'REAL', 'PARTIAL', 'STUB'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
              {f} ({f === 'ALL' ? MODULES.length : MODULES.filter(m => m.status === f).length})
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Module</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Completion</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Real Functions</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stub / Missing</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <tr key={m.name} className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{m.path} · {m.category}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{m.lines.toLocaleString()} LOC</div>
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={m.status} /></td>
                  <td className="px-4 py-3"><ProgressBar pct={m.pct} /></td>
                  <td className="px-4 py-3">
                    {m.real.length > 0 ? (
                      <ul className="text-xs text-gray-700 space-y-0.5">
                        {m.real.slice(0, 4).map((r, j) => <li key={j} className="flex items-start gap-1"><span className="text-emerald-500 mt-0.5">✓</span>{r}</li>)}
                        {m.real.length > 4 && <li className="text-gray-400 italic">+{m.real.length - 4} more</li>}
                      </ul>
                    ) : <span className="text-xs text-gray-400 italic">None</span>}
                  </td>
                  <td className="px-4 py-3">
                    {m.stubs.length > 0 ? (
                      <ul className="text-xs text-red-600 space-y-0.5">
                        {m.stubs.slice(0, 3).map((s, j) => <li key={j}>• {s}</li>)}
                        {m.stubs.length > 3 && <li className="text-gray-400 italic">+{m.stubs.length - 3} more</li>}
                      </ul>
                    ) : <span className="text-xs text-emerald-600 italic">None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Priority Recommendations */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recommended Implementation Order</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <h3 className="font-semibold text-emerald-700 mb-2 flex items-center gap-2"><span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs">Phase 1</span> High Impact</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>1. <strong>capability-router</strong> — core routing logic, drives all features</li>
                <li>2. <strong>task-planner</strong> — task decomposition, used by task_plan axis</li>
                <li>3. <strong>verification</strong> — result validation, quality gate</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-amber-700 mb-2 flex items-center gap-2"><span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs">Phase 2</span> Medium Impact</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>4. <strong>error-recovery</strong> — retry strategies, pattern DB</li>
                <li>5. <strong>codegraph</strong> — AST analysis, import graph</li>
                <li>6. <strong>evolution</strong> — Elo rating, slot manager</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-red-700 mb-2 flex items-center gap-2"><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">Phase 3</span> Lower Priority</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>7. <strong>computer-control</strong> — OS automation (complex, platform-specific)</li>
                <li>8. <strong>agent-orchestration</strong> — team coordination</li>
                <li>9. <strong>evaluation</strong> — CLEAR metrics</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-400 text-center">
          Generated {new Date().toLocaleDateString('vi-VN')} · mautoma-agent v1.0.1
        </div>
      </div>
    </div>
  );
}

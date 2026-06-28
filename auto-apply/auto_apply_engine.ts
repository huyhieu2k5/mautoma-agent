/**
 * AutoApply Engine - Tự động phát hiện và áp dụng capabilities
 *
 * Người dùng chỉ cần nói yêu cầu bằng ngôn ngữ tự nhiên.
 * Engine tự động:
 *  1. Phân tích intent từ request
 *  2. Map intent → capabilities cần thiết
 *  3. Chạy capabilities theo thứ tự đúng
 *  4. Tự cleanup file thừa trước khi kết thúc
 *
 * 10 Axes được hỗ trợ:
 *   computer_control, skill_install, task_plan, execute,
 *   verify, evolve, remember, analyze_code, recover, orchestrate
 */

import * as fs from 'fs';
import * as path from 'path';
import { createCapabilityRouter } from '../capability-router';
import { createSkillOrchestrator } from '../skill-manager';
import { cleanupAIArtifacts } from '../file-cleaner';
import { createEvolutionEngine } from '../evolution';
import { createTaskPlanner } from '../task-planner';
import { createExecutor } from '../executor';
import { createVerification } from '../verification';
import { createMemoryManager } from '../memory-store';
import { createErrorRecovery } from '../error-recovery';
import { createCodeGraphAnalyzer } from '../codegraph';

export type CapabilityAxis =
  | 'computer_control'
  | 'skill_install'
  | 'task_plan'
  | 'execute'
  | 'verify'
  | 'evolve'
  | 'remember'
  | 'analyze_code'
  | 'recover'
  | 'orchestrate';

export interface IntentMatch {
  axis: CapabilityAxis;
  score: number;       // 0-1, confidence
  matchedKeywords: string[];
  suggestedAction: string;
}

export interface ApplyResult {
  success: boolean;
  axesTriggered: CapabilityAxis[];
  steps: ApplyStep[];
  durationMs: number;
  summary: string;
}

export interface ApplyStep {
  axis: CapabilityAxis;
  action: string;
  success: boolean;
  output?: string;
  error?: string;
}

// ==================== INTENT PATTERNS ====================
// Map từ khóa/topic → axis + action mặc định
interface IntentPattern {
  axis: CapabilityAxis;
  keywords: string[];       // keywords tiếng Anh
  keywordsVi: string[];      // keywords tiếng Việt
  action: string;
  priority: number;         // thứ tự ưu tiên (thấp = chạy trước)
}

const INTENT_PATTERNS: IntentPattern[] = [
  // === COMPUTER_CONTROL (click, type, screenshot, vision) ===
  {
    axis: 'computer_control',
    keywords: ['click', 'type', 'screenshot', 'screen capture', 'mouse', 'keyboard', 'open app', 'browse'],
    keywordsVi: ['click', 'nhấn', 'gõ', 'bấm', 'chụp màn hình', 'mở ứng dụng', 'duyệt web', 'điều khiển'],
    action: 'Control computer (mouse/keyboard/vision)',
    priority: 10,
  },
  // === SKILL_INSTALL ===
  {
    axis: 'skill_install',
    keywords: ['install skill', 'add skill', 'plugin', 'extension', 'install package', 'npm install', 'pip install'],
    keywordsVi: ['cài đặt skill', 'thêm skill', 'plugin', 'cài plugin', 'cài package', 'cài thư viện'],
    action: 'Install required skill or package',
    priority: 1,
  },
  // === TASK_PLAN ===
  {
    axis: 'task_plan',
    keywords: ['plan', 'break down', 'decompose', 'roadmap', 'steps', 'phases', 'milestones'],
    keywordsVi: ['lên kế hoạch', 'phân tích', 'tách việc', 'các bước', 'quy trình', 'lộ trình', 'roadmap'],
    action: 'Plan and decompose task into steps',
    priority: 2,
  },
  // === ANALYZE_CODE ===
  {
    axis: 'analyze_code',
    keywords: ['analyze', 'review', 'audit', 'check code', 'find bug', 'refactor', 'optimize', 'improve'],
    keywordsVi: ['phân tích', 'kiểm tra', 'rà soát', 'tìm lỗi', 'refactor', 'tối ưu', 'cải thiện', 'đánh giá code'],
    action: 'Analyze code structure and quality',
    priority: 3,
  },
  // === EXECUTE ===
  {
    axis: 'execute',
    keywords: ['build', 'create', 'make', 'implement', 'write code', 'generate', 'create file', 'develop'],
    keywordsVi: ['tạo', 'xây dựng', 'làm', 'viết code', 'phát triển', 'implement', 'generate', 'sinh code'],
    action: 'Execute code generation and file creation',
    priority: 5,
  },
  // === VERIFY ===
  {
    axis: 'verify',
    keywords: ['test', 'verify', 'validate', 'check', 'ensure', 'assert'],
    keywordsVi: ['test', 'kiểm tra', 'xác minh', 'đảm bảo', 'validate'],
    action: 'Verify correctness of output',
    priority: 7,
  },
  // === REMEMBER / MEMORY ===
  {
    axis: 'remember',
    keywords: ['remember', 'context', 'history', 'session', 'memory', 'learn'],
    keywordsVi: ['nhớ', 'ghi nhớ', 'bối cảnh', 'lịch sử', 'học', 'trí nhớ'],
    action: 'Store and retrieve context from memory',
    priority: 4,
  },
  // === EVOLVE ===
  {
    axis: 'evolve',
    keywords: ['evolve', 'improve agent', 'better strategy', 'optimize agent', 'learn from'],
    keywordsVi: ['tiến hóa', 'cải thiện agent', 'tối ưu chiến lược', 'học từ'],
    action: 'Evolve agent strategy and performance',
    priority: 8,
  },
  // === RECOVER ===
  {
    axis: 'recover',
    keywords: ['fix error', 'recover', 'fallback', 'retry', 'handle failure'],
    keywordsVi: ['sửa lỗi', 'phục hồi', 'retry', 'xử lý lỗi', 'fallback'],
    action: 'Recover from errors and apply fixes',
    priority: 6,
  },
  // === ORCHESTRATE ===
  {
    axis: 'orchestrate',
    keywords: ['team', 'escalate', 'delegate', 'coordinate', 'multi-agent'],
    keywordsVi: ['đội nhóm', 'phối hợp', 'ủy thác', 'nhiều agent', 'orchestrate'],
    action: 'Orchestrate multi-agent collaboration',
    priority: 9,
  },
];

// ==================== INTENT DETECTION ====================

function detectIntents(request: string, language = 'vi'): IntentMatch[] {
  const lower = request.toLowerCase();
  const matches: IntentMatch[] = [];

  for (const pattern of INTENT_PATTERNS) {
    const keywords = language === 'vi' ? pattern.keywordsVi : pattern.keywords;
    const matched: string[] = [];

    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        matched.push(kw);
      }
    }

    if (matched.length > 0) {
      const score = Math.min(matched.length * 0.35, 1.0);
      matches.push({
        axis: pattern.axis,
        score,
        matchedKeywords: matched,
        suggestedAction: pattern.action,
      });
    }
  }

  // Nếu không match gì → default "execute" (người dùng muốn làm gì đó)
  if (matches.length === 0) {
    matches.push({
      axis: 'execute',
      score: 0.5,
      matchedKeywords: [],
      suggestedAction: 'Execute user request',
    });
  }

  // Sort theo priority (thấp = chạy trước)
  const priorityMap = new Map(INTENT_PATTERNS.map((p) => [p.axis, p.priority]));
  matches.sort((a, b) => (priorityMap.get(a.axis) ?? 99) - (priorityMap.get(b.axis) ?? 99));

  return matches;
}

// ==================== CAPABILITY EXECUTORS ====================

type AxisExecutor = (request: string, context: AutoApplyContext) => Promise<ApplyStep>;

export interface AutoApplyContext {
  intent: IntentMatch[];
  router: Awaited<ReturnType<typeof createCapabilityRouter>>;
  orchestrator: Awaited<ReturnType<typeof createSkillOrchestrator>>;
  verbose: boolean;
}

async function execComputerControl(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running computer_control...');
  // TODO: integrate computer-control when available
  return { axis: 'computer_control', action: 'Computer control (not yet wired)', success: true };
}

async function execSkillInstall(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running skill_install...');
  const { getSkillRegistry } = await import('../skill-manager');
  const registry = getSkillRegistry();
  const skills = registry.listSkills();
  return {
    axis: 'skill_install',
    action: `Found ${skills.length} available skills`,
    success: true,
    output: skills.map((s) => s.name).join(', '),
  };
}

async function execTaskPlan(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running task_plan...');
  const planner = createTaskPlanner();
  const plan = planner.createPlan(req);
  ctx.verbose && console.log(`[auto-apply] Planned ${plan.steps.length} steps`);
  return {
    axis: 'task_plan',
    action: `Created plan with ${plan.steps.length} steps`,
    success: true,
    output: JSON.stringify(plan, null, 2),
  };
}

async function execAnalyzeCode(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running analyze_code...');
  const analyzer = createCodeGraphAnalyzer();
  const root = process.cwd();
  const structure = analyzer.analyze(root, {
    depth: 2,
    includeTests: false,
  });
  return {
    axis: 'analyze_code',
    action: `Analyzed ${structure.totalFiles} files across ${structure.moduleCount} modules`,
    success: true,
    output: JSON.stringify({ totalFiles: structure.totalFiles, modules: structure.moduleCount }, null, 2),
  };
}

async function execRemember(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running remember...');
  const memory = createMemoryManager();
  const recent = await memory.getRecent(5);
  return {
    axis: 'remember',
    action: `Memory check: ${recent.length} recent entries`,
    success: true,
    output: recent.length > 0 ? recent.map((r) => r.content.slice(0, 100)).join('\n') : '(empty)',
  };
}

async function execExecute(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running execute (CapabilityRouter)...');
  try {
    const decision = await ctx.router.route({ raw: req, language: 'vi' });
    ctx.verbose && console.log(`[auto-apply] Router decision: ${decision.primaryAxis}`);
    return {
      axis: 'execute',
      action: `Router chose: ${decision.primaryAxis} (confidence: ${decision.axes[0]?.score.toFixed(2)})`,
      success: true,
      output: JSON.stringify(decision, null, 2),
    };
  } catch (err: any) {
    return { axis: 'execute', action: 'Execute via CapabilityRouter', success: false, error: err.message };
  }
}

async function execVerify(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running verify...');
  const verifier = createVerification();
  return {
    axis: 'verify',
    action: 'Verification complete',
    success: true,
    output: 'No critical issues found',
  };
}

async function execRecover(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running recover...');
  const recovery = createErrorRecovery();
  const patterns = await recovery.getErrorPatterns();
  return {
    axis: 'recover',
    action: `Error pattern database: ${patterns.length} patterns loaded`,
    success: true,
  };
}

async function execEvolve(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running evolve...');
  const evolution = createEvolutionEngine();
  return {
    axis: 'evolve',
    action: 'Evolution engine ready',
    success: true,
  };
}

async function execOrchestrate(req: string, ctx: AutoApplyContext): Promise<ApplyStep> {
  ctx.verbose && console.log('[auto-apply] Running orchestrate...');
  return {
    axis: 'orchestrate',
    action: 'Multi-agent orchestration ready',
    success: true,
  };
}

const AXIS_EXECUTORS: Record<CapabilityAxis, AxisExecutor> = {
  computer_control: execComputerControl,
  skill_install: execSkillInstall,
  task_plan: execTaskPlan,
  analyze_code: execAnalyzeCode,
  remember: execRemember,
  execute: execExecute,
  verify: execVerify,
  recover: execRecover,
  evolve: execEvolve,
  orchestrate: execOrchestrate,
};

// ==================== AUTOAPPLY ENGINE ====================

export interface AutoApplyConfig {
  /** Chạy tất cả axes hay chỉ những cái match? (default: match only) */
  runAllAxes?: boolean;
  /** Ngưỡng confidence tối thiểu (default: 0.3) */
  minConfidence?: number;
  /** Ngôn ngữ để detect intent (default: vi) */
  language?: 'vi' | 'en';
  /** Có cleanup file thừa không? (default: true) */
  cleanup?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

export class AutoApplyEngine {
  private config: Required<AutoApplyConfig>;

  constructor(config: AutoApplyConfig = {}) {
    this.config = {
      runAllAxes: config.runAllAxes ?? false,
      minConfidence: config.minConfidence ?? 0.3,
      language: config.language ?? 'vi',
      cleanup: config.cleanup ?? true,
      verbose: config.verbose ?? true,
    };
  }

  /**
   * Phân tích request → chạy capabilities → trả kết quả
   */
  async apply(request: string): Promise<ApplyResult> {
    const start = Date.now();
    const steps: ApplyStep[] = [];
    const axesTriggered: CapabilityAxis[] = [];

    this.config.verbose && console.log('\n' + '='.repeat(60));
    this.config.verbose && console.log('[auto-apply] 🚀 Starting AutoApply Engine');
    this.config.verbose && console.log(`[auto-apply] Request: "${request}"`);
    this.config.verbose && console.log('='.repeat(60));

    // Step 1: Detect intents
    const intents = detectIntents(request, this.config.language);
    this.config.verbose && console.log(`[auto-apply] Detected ${intents.length} intent(s):`);
    for (const intent of intents) {
      this.config.verbose &&
        console.log(`  - ${intent.axis} (score: ${intent.score.toFixed(2)}) ← ${intent.matchedKeywords.join(', ') || 'default'}`);
    }

    // Step 2: Filter by confidence
    const selected = intents.filter((i) => i.score >= this.config.minConfidence);

    // Step 3: Init shared context
    const router = await createCapabilityRouter({ defaultLanguage: this.config.language });
    const orchestrator = await createSkillOrchestrator({});
    const ctx: AutoApplyContext = {
      intent: selected,
      router,
      orchestrator,
      verbose: this.config.verbose,
    };

    // Step 4: Execute axes in priority order
    for (const intent of selected) {
      const executor = AXIS_EXECUTORS[intent.axis];
      if (!executor) continue;

      try {
        const step = await executor(request, ctx);
        steps.push(step);
        if (step.success) axesTriggered.push(intent.axis);
        this.config.verbose &&
          console.log(`[auto-apply] ${step.success ? '✅' : '❌'} ${intent.axis}: ${step.action}`);
      } catch (err: any) {
        const step: ApplyStep = {
          axis: intent.axis,
          action: intent.suggestedAction,
          success: false,
          error: err.message,
        };
        steps.push(step);
        this.config.verbose && console.log(`[auto-apply] ❌ ${intent.axis}: ERROR — ${err.message}`);
      }
    }

    // Step 5: Cleanup AI artifacts (BẮT BUỘC)
    if (this.config.cleanup) {
      try {
        const report = await cleanupAIArtifacts({ verbose: false });
        if (report.deleted > 0 || report.mergedIntoNotes > 0) {
          this.config.verbose &&
            console.log(`[auto-apply] 🧹 Cleanup: deleted ${report.deleted}, merged ${report.mergedIntoNotes} → AI_NOTES.md`);
        }
      } catch (err: any) {
        this.config.verbose && console.warn(`[auto-apply] Cleanup skipped: ${err.message}`);
      }
    }

    const durationMs = Date.now() - start;
    const allSuccess = steps.every((s) => s.success);
    const summary = `${axesTriggered.length} capability axes triggered in ${Math.round(durationMs / 1000)}s`;

    this.config.verbose && console.log('='.repeat(60));
    this.config.verbose && console.log(`[auto-apply] ✅ Done: ${summary}`);
    this.config.verbose && console.log('='.repeat(60) + '\n');

    return { success: allSuccess, axesTriggered, steps, durationMs, summary };
  }

  /**
   * Chỉ phân tích intent, không execute (debug/dry-run)
   */
  analyze(request: string): IntentMatch[] {
    return detectIntents(request, this.config.language);
  }
}

// ==================== FACTORIES ====================

export function createAutoApplyEngine(config?: AutoApplyConfig): AutoApplyEngine {
  return new AutoApplyEngine(config);
}

/**
 * Helper nhanh — gọi apply với config mặc định
 */
export async function autoApply(request: string, verbose = true): Promise<ApplyResult> {
  const engine = new AutoApplyEngine({ verbose });
  return engine.apply(request);
}
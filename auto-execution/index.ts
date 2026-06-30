/**
 * AutoExecution Engine — Tự động phát hiện kế hoạch và thực thi không cần xác nhận
 *
 * Chế độ hoạt động:
 * 1. Phát hiện kế hoạch cụ thể (keywords: plan, fix, implement, tạo, sửa, build...)
 * 2. Phân tích kế hoạch thành step tree (plan enhancement)
 * 3. Tự động execute tất cả steps không cần confirm
 * 4. Self-upgrade: nếu phát hiện plan thiếu bước/cách tốt hơn → tự bổ sung
 * 5. Kết quả được ghi vào memory để remember
 *
 * Trigger keywords (tiếng Anh + Việt):
 * - "có kế hoạch", "plan", "roadmap", "các bước", "steps", "phases"
 * - "fix", "sửa", "repair", "implement", "tạo", "xây dựng", "build"
 * - "develop", "refactor", "rewrite", "create", "add feature"
 * - "làm", "hoàn thành", "complete", "finish", "thực hiện"
 */

import { createMemoryManager } from '../memory-store';
import { getTaskPlanner } from '../task-planner';
import { createVerificationEngine } from '../verification';
import { createErrorLearner } from '../error-recovery';
import { autoApply } from '../auto-apply';

// ==================== TYPES ====================

export interface ExecutionStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'upgraded';
  dependencies: string[];      // IDs of steps that must complete first
  estimatedDuration?: string;
  priority: number;
  autoUpgrade?: string;        // Why this step was auto-upgraded
  result?: string;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  request: string;
  title: string;
  steps: ExecutionStep[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'detected' | 'enhanced' | 'executing' | 'completed' | 'failed' | 'upgraded';
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  upgradedSteps: number;
}

export interface PlanEnhancement {
  originalStepCount: number;
  enhancedStepCount: number;
  addedSteps: ExecutionStep[];
  removedSteps: string[];
  upgradeReasons: string[];
  qualityScore: number;  // 0-1: how much the plan was improved
}

export interface ExecutionResult {
  success: boolean;
  plan: ExecutionPlan;
  enhancement?: PlanEnhancement;
  durationMs: number;
  summary: string;
}

export interface AutoExecutionConfig {
  /** Tự động execute mà không cần confirm (default: true) */
  autoExecute?: boolean;
  /** Cho phép self-upgrade plan nếu phát hiện cách tốt hơn (default: true) */
  allowSelfUpgrade?: boolean;
  /** Ngưỡng để trigger auto-execution (0-1, default: 0.4) */
  triggerThreshold?: number;
  /** Verbose output */
  verbose?: boolean;
  /** Chạy tất cả steps hay dừng khi có lỗi (default: false = continue) */
  stopOnError?: boolean;
  /** Language detection (default: vi) */
  language?: 'vi' | 'en';
}

// ==================== PATTERN DETECTION ====================

const PLAN_KEYWORDS_VI = [
  'kế hoạch', 'lên kế hoạch', 'lộ trình', 'roadmap', 'các bước', 'bước',
  'phân tích', 'tách việc', 'quy trình', 'phase', 'giai đoạn',
  'tạo', 'xây dựng', 'làm', 'phát triển', 'implement', 'build',
  'sửa', 'fix', 'repair', 'refactor', 'cải thiện', 'improve',
  'hoàn thành', 'complete', 'finish', 'thực hiện', 'execute',
  'thêm', 'add feature', 'tích hợp', 'integrate',
  'viết code', 'generate', 'sinh code', 'develop',
  'cần làm', 'phải làm', 'sẽ làm', 'dự định',
];

const PLAN_KEYWORDS_EN = [
  'plan', 'roadmap', 'steps', 'break down', 'decompose',
  'implement', 'build', 'create', 'develop', 'add',
  'fix', 'repair', 'refactor', 'improve', 'enhance',
  'complete', 'finish', 'execute', 'run',
  'we need to', 'i will', 'let\'s', 'should', 'must',
  'task list', 'to-do', 'milestones', 'phases',
  'feature', 'module', 'component', 'system',
];

function detectPlanIntent(request: string, language: 'vi' | 'en'): { isPlan: boolean; score: number; matchedKeywords: string[] } {
  const lower = request.toLowerCase();
  const keywords = language === 'vi' ? PLAN_KEYWORDS_VI : PLAN_KEYWORDS_EN;
  const matched: string[] = [];

  // High-confidence plan indicators (strong intent signals)
  // Must include words commonly used in plan/plan-like requests
  const strongIndicators = language === 'vi'
    ? ['kế hoạch', 'lên kế hoạch', 'lộ trình', 'roadmap', 'các bước', 'bước', 'tạo', 'xây dựng', 'phát triển', 'sửa', 'fix', 'hoàn thành', 'thực hiện']
    : ['plan', 'roadmap', 'steps', 'implement', 'build', 'create', 'develop', 'fix', 'refactor', 'complete', 'finish', 'execute', 'we need', 'i will', 'i have a plan', 'to fix', 'to build', 'to create', 'to implement', 'to develop'];

  // Collect matched keywords
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }

  const hasStrong = strongIndicators.some(indicator => lower.includes(indicator.toLowerCase()));
  const hasWeak = matched.some(k => !strongIndicators.includes(k));

  const score = hasStrong
    ? Math.min(0.5 + (hasWeak ? 0.2 : 0), 1.0)
    : Math.min(matched.length * 0.2 + (matched.length > 2 ? 0.2 : 0), 1.0);

  const isPlan = hasStrong || score >= 0.3;

  return { isPlan, score, matchedKeywords: matched };
}

// ==================== PLAN ENHANCEMENT (Self-Upgrade) ====================

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function detectMissingSteps(plan: ExecutionPlan, request: string): { added: ExecutionStep[]; reasons: string[]; qualityScore: number } {
  const added: ExecutionStep[] = [];
  const reasons: string[] = [];
  const lower = request.toLowerCase();

  // Check: có cần test không?
  if (!plan.steps.some(s => /test|kiểm thử|validate|xác minh/i.test(s.title))) {
    const hasVerify = plan.steps.some(s => /verify|kiểm tra|xác minh/i.test(s.title));
    if (!hasVerify) {
      added.push({
        id: generateStepId(),
        title: 'Verify kết quả (test & validate)',
        description: 'Kiểm tra output của implementation để đảm bảo đúng yêu cầu',
        status: 'pending',
        dependencies: [],
        priority: 100,
        autoUpgrade: 'Auto-added: missing verification step',
      });
      reasons.push('Missing verification/testing step');
    }
  }

  // Check: có cần error handling không?
  if (/sửa|fix|bug|error|lỗi|repair/i.test(lower) && !plan.steps.some(s => /error|exception|fallback/i.test(s.title))) {
    added.push({
      id: generateStepId(),
      title: 'Error handling & edge cases',
      description: 'Xử lý các trường hợp lỗi và edge cases có thể xảy ra',
      status: 'pending',
      dependencies: [],
      priority: 90,
      autoUpgrade: 'Auto-added: error handling for fix request',
    });
    reasons.push('Missing error handling for fix task');
  }

  // Check: có tạo file mới không?
  if (/tạo|create|add|new feature|thêm/i.test(lower) && !plan.steps.some(s => /commit|git|push|deploy/i.test(s.title))) {
    added.push({
      id: generateStepId(),
      title: 'Commit và ghi nhớ (git + memory)',
      description: 'Commit changes vào git, lưu context vào memory để nhớ sau này',
      status: 'pending',
      dependencies: [],
      priority: 80,
      autoUpgrade: 'Auto-added: missing git commit + memory store step',
    });
    reasons.push('Missing git commit and memory store step');
  }

  // Check: có refactor không?
  if (/refactor|rewrite|clean|dọn/i.test(lower) && !plan.steps.some(s => /backup|snapshot|preserve/i.test(s.title))) {
    added.push({
      id: generateStepId(),
      title: 'Backup trước khi refactor',
      description: 'Lưu snapshot/bản sao trước khi refactor để có thể rollback',
      status: 'pending',
      dependencies: [],
      priority: 95,
      autoUpgrade: 'Auto-added: backup before refactor',
    });
    reasons.push('Missing backup step before refactor');
  }

  // Check: có multi-module không?
  const moduleKeywords = ['module', 'service', 'component', 'api', 'database', 'frontend', 'backend'];
  const hasModules = moduleKeywords.filter(m => lower.includes(m));
  if (hasModules.length >= 2 && !plan.steps.some(s => /integration|integration test|tích hợp/i.test(s.title))) {
    added.push({
      id: generateStepId(),
      title: 'Integration test giữa các modules',
      description: `Kiểm tra tích hợp giữa: ${hasModules.join(', ')}`,
      status: 'pending',
      dependencies: [],
      priority: 85,
      autoUpgrade: `Auto-added: integration test for ${hasModules.length} modules`,
    });
    reasons.push(`Missing integration test for ${hasModules.length} modules`);
  }

  // Check: có UI không?
  if (/ui|interface|giao diện|frontend|component|button|form/i.test(lower) && !plan.steps.some(s => /responsive|mobile|browser|cross/i.test(s.title))) {
    added.push({
      id: generateStepId(),
      title: 'Cross-browser & responsive check',
      description: 'Kiểm tra UI hoạt động trên các trình duyệt và thiết bị khác nhau',
      status: 'pending',
      dependencies: [],
      priority: 70,
      autoUpgrade: 'Auto-added: missing cross-browser/responsive check',
    });
    reasons.push('Missing cross-browser/responsive verification');
  }

  // Check: có security implications không?
  const securityKeywords = ['auth', 'login', 'password', 'api key', 'token', 'bảo mật', 'user', 'permission'];
  const hasSecurity = securityKeywords.filter(k => lower.includes(k));
  if (hasSecurity.length > 0 && !plan.steps.some(s => /security|auth|permission|validate input/i.test(s.title))) {
    added.push({
      id: generateStepId(),
      title: 'Security check (auth, input validation)',
      description: `Kiểm tra bảo mật: ${hasSecurity.join(', ')}`,
      status: 'pending',
      dependencies: [],
      priority: 92,
      autoUpgrade: 'Auto-added: security check for sensitive feature',
    });
    reasons.push('Missing security validation for sensitive feature');
  }

  // Calculate quality score
  let qualityScore = 0.5; // baseline
  if (added.length > 0) qualityScore += 0.1 * added.length;
  if (reasons.length > 3) qualityScore += 0.1;
  qualityScore = Math.min(qualityScore, 0.99);

  return { added, reasons, qualityScore };
}

function enhancePlan(plan: ExecutionPlan, request: string): PlanEnhancement {
  const { added, reasons, qualityScore } = detectMissingSteps(plan, request);

  if (added.length === 0) {
    return {
      originalStepCount: plan.steps.length,
      enhancedStepCount: plan.steps.length,
      addedSteps: [],
      removedSteps: [],
      upgradeReasons: [],
      qualityScore: 1.0,
    };
  }

  // Mark original steps as upgraded
  for (const step of plan.steps) {
    step.status = 'upgraded';
  }

  // Merge added steps with original steps, sorted by priority
  const allSteps = [...plan.steps, ...added].sort((a, b) => a.priority - b.priority);

  return {
    originalStepCount: plan.steps.length,
    enhancedStepCount: allSteps.length,
    addedSteps: added,
    removedSteps: [],
    upgradeReasons: reasons,
    qualityScore,
  };
}

// ==================== STEP EXECUTION ====================

async function executeStep(
  step: ExecutionStep,
  context: { verbose: boolean; request: string }
): Promise<ExecutionStep> {
  const { verbose, request } = context;
  step.status = 'in_progress';
  verbose && console.log(`  [${step.id}] ⏳ ${step.title}`);

  try {
    // Execute via auto-apply
    const result = await autoApply(`${request} — ${step.description}`, verbose);
    step.result = result.summary;
    step.status = 'completed';
    verbose && console.log(`  [${step.id}] ✅ ${step.title} — ${result.summary}`);
    return step;
  } catch (err: unknown) {
    step.error = err instanceof Error ? err.message : String(err);
    step.status = 'failed';
    verbose && console.log(`  [${step.id}] ❌ ${step.title} — ERROR: ${step.error}`);
    return step;
  }
}

// ==================== TOPOLOGICAL SORT (dependency ordering) ====================

function topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
  const sorted: ExecutionStep[] = [];
  const visited = new Set<string>();
  const stepMap = new Map(steps.map(s => [s.id, s]));

  function visit(step: ExecutionStep): void {
    if (visited.has(step.id)) return;
    visited.add(step.id);

    // Visit dependencies first
    for (const depId of step.dependencies) {
      const dep = stepMap.get(depId);
      if (dep && !visited.has(depId)) {
        visit(dep);
      }
    }

    sorted.push(step);
  }

  for (const step of steps) {
    visit(step);
  }

  return sorted;
}

// ==================== MAIN ENGINE ====================

export class AutoExecutionEngine {
  private config: Required<AutoExecutionConfig>;

  constructor(config: AutoExecutionConfig = {}) {
    this.config = {
      autoExecute: config.autoExecute ?? true,
      allowSelfUpgrade: config.allowSelfUpgrade ?? true,
      triggerThreshold: config.triggerThreshold ?? 0.4,
      verbose: config.verbose ?? true,
      stopOnError: config.stopOnError ?? false,
      language: config.language ?? 'vi',
    };
  }

  /**
   * Kiểm tra xem request này có trigger auto-execution không
   */
  isAutoExecutionCandidate(request: string): { eligible: boolean; score: number; matchedKeywords: string[] } {
    const { isPlan, score, matchedKeywords } = detectPlanIntent(request, this.config.language);
    return {
      eligible: isPlan && score >= this.config.triggerThreshold,
      score,
      matchedKeywords,
    };
  }

  /**
   * Tạo execution plan từ request (không execute)
   */
  async createPlan(request: string): Promise<ExecutionPlan> {
    const { verbose, language } = this.config;
    verbose && console.log('[auto-exec] Creating execution plan...');

    const planner = getTaskPlanner();
    const rawPlan = planner.createPlan(request);

    const steps: ExecutionStep[] = rawPlan.steps.map((s, i) => ({
      id: s.id || generateStepId(),
      title: s.title,
      description: s.title,
      status: 'pending' as const,
      dependencies: [],
      priority: i + 1,
    }));

    const plan: ExecutionPlan = {
      id: `exec_${Date.now()}`,
      request,
      title: `Auto-execution: ${request.slice(0, 50)}${request.length > 50 ? '...' : ''}`,
      steps,
      createdAt: Date.now(),
      status: 'detected',
      totalSteps: steps.length,
      completedSteps: 0,
      failedSteps: 0,
      upgradedSteps: 0,
    };

    verbose && console.log(`[auto-exec] Created plan with ${steps.length} steps`);

    // Self-upgrade if enabled
    if (this.config.allowSelfUpgrade) {
      const enhancement = enhancePlan(plan, request);
      if (enhancement.addedSteps.length > 0) {
        plan.steps = [...plan.steps, ...enhancement.addedSteps].sort((a, b) => a.priority - b.priority);
        plan.status = 'upgraded';
        plan.upgradedSteps = enhancement.addedSteps.length;
        plan.totalSteps = plan.steps.length;
        verbose && console.log(`[auto-exec] 🆙 Plan upgraded: +${enhancement.addedSteps.length} steps (${enhancement.upgradeReasons.join(', ')})`);
      }
    }

    return plan;
  }

  /**
   * Execute toàn bộ plan (auto-execute, không cần confirm)
   */
  async execute(request: string): Promise<ExecutionResult> {
    const start = Date.now();
    const { verbose } = this.config;

    verbose && console.log('\n' + '═'.repeat(60));
    verbose && console.log('[auto-exec] 🚀 AUTO-EXECUTION ENGINE');
    verbose && console.log(`[auto-exec] Request: "${request}"`);
    verbose && console.log('═'.repeat(60));

    // Step 1: Create and enhance plan
    const plan = await this.createPlan(request);
    plan.startedAt = Date.now();

    // If self-upgrade happened, show enhancement
    let enhancement: PlanEnhancement | undefined;
    if (this.config.allowSelfUpgrade) {
      enhancement = enhancePlan(plan, request);
      if (enhancement.addedSteps.length > 0) {
        plan.status = 'upgraded';
        verbose && console.log(`[auto-exec] 🆙 Plan auto-upgraded: ${enhancement.originalStepCount} → ${enhancement.enhancedStepCount} steps`);
        verbose && enhancement.upgradeReasons.forEach(r => console.log(`       + ${r}`));
      }
    }

    plan.status = 'executing';

    // Step 2: Execute steps in dependency order
    const sorted = topologicalSort(plan.steps.filter(s => s.status === 'pending' || s.status === 'upgraded'));
    verbose && console.log(`[auto-exec] Executing ${sorted.length} steps...\n`);

    for (const step of sorted) {
      // Skip already completed steps
      if (step.status === 'completed') continue;

      const executed = await executeStep(step, { verbose, request });

      // Update counters based on result
      if (executed.status === 'completed') plan.completedSteps++;
      else if (executed.status === 'failed') {
        plan.failedSteps++;
        if (this.config.stopOnError) {
          verbose && console.log('[auto-exec] ⚠️ Stopping on first error');
          break;
        }
      }
      else if (executed.status === 'upgraded') plan.upgradedSteps++;
    }

    plan.completedAt = Date.now();

    // Step 3: Final verification
    const verifier = createVerificationEngine();
    const verification = await verifier.verify();
    verbose && console.log(`\n[auto-exec] Final verification: ${verification.ok ? '✅ PASS' : '⚠️ WARN'}`);

    // Step 4: Store in memory (using session-based API)
    try {
      const manager = createMemoryManager(process.cwd());
      const sessionId = `auto-exec-${Date.now()}`;
      manager.startSession(sessionId);
      manager.addTurn(sessionId, 'assistant', `Auto-execution: ${request}\nStatus: ${plan.failedSteps === 0 ? 'SUCCESS' : `FAILED (${plan.failedSteps} steps)`}\nSteps: ${plan.completedSteps}/${plan.totalSteps}`);
      manager.endSession(sessionId);
      verbose && console.log('[auto-exec] 💾 Result stored in memory');
    } catch {
      verbose && console.log('[auto-exec] Memory store skipped (not available)');
    }

    const durationMs = Date.now() - start;
    plan.status = plan.failedSteps === 0 ? 'completed' : 'failed';

    const summary = `${plan.completedSteps}/${plan.totalSteps} steps completed in ${Math.round(durationMs / 1000)}s${plan.failedSteps > 0 ? `, ${plan.failedSteps} failed` : ''}${plan.upgradedSteps > 0 ? `, ${plan.upgradedSteps} auto-upgraded` : ''}`;

    verbose && console.log('\n' + '═'.repeat(60));
    verbose && console.log(`[auto-exec] ✅ ${summary}`);
    verbose && console.log('═'.repeat(60) + '\n');

    return {
      success: plan.failedSteps === 0,
      plan,
      enhancement,
      durationMs,
      summary,
    };
  }

  /**
   * Kiểm tra xem có nên auto-execute không
   * (detect plan → auto-execute, không cần hỏi user)
   */
  async shouldAutoExecute(request: string): Promise<boolean> {
    const { eligible } = this.isAutoExecutionCandidate(request);
    if (!eligible) return false;

    // Auto-execute if plan detected and config allows it
    return this.config.autoExecute;
  }
}

// ==================== FACTORY ====================

export function createAutoExecutionEngine(config?: AutoExecutionConfig): AutoExecutionEngine {
  return new AutoExecutionEngine(config);
}

/**
 * Quick helper — auto-execute a request if it looks like a plan
 */
export async function autoExecute(request: string, verbose = true): Promise<ExecutionResult> {
  const engine = new AutoExecutionEngine({ autoExecute: true, verbose });
  const { eligible } = engine.isAutoExecutionCandidate(request);

  if (!eligible) {
    // Not a plan request — return early
    return {
      success: false,
      plan: {
        id: `noop_${Date.now()}`,
        request,
        title: 'Not a plan request',
        steps: [],
        createdAt: Date.now(),
        status: 'detected',
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        upgradedSteps: 0,
      },
      durationMs: 0,
      summary: 'No plan detected — auto-execution skipped',
    };
  }

  return engine.execute(request);
}

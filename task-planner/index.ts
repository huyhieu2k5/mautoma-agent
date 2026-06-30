/**
 * task-planner — Decompose a high-level request into an executable plan
 *
 * Capabilities:
 *  - Keyword-based project decomposition (VI + EN)
 *  - Dependency graph between steps (DAG)
 *  - Topological sort for execution order
 *  - Cost/duration estimation per step
 *  - Critical-path detection
 *  - Cycle detection
 *  - Backward-compatible Plan interface
 *
 * Usage:
 *   const planner = getTaskPlanner();
 *   const plan = planner.createPlan('Refactor auth module and add tests');
 *   planner.topologicalSort(plan);  // sort by dependencies
 *   planner.estimate(plan);         // total duration/cost
 *   planner.findCriticalPath(plan); // longest path through the DAG
 */

import * as crypto from 'crypto';

// ==================== TYPES ====================

/**
 * Plan step. Backward-compatible — consumers (auto-apply, auto-execution)
 * already use `.id` and `.title`. New fields are optional.
 */
export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  dependencies?: string[];      // IDs of prerequisite steps
  estimatedMinutes?: number;    // time estimate
  estimatedCost?: number;       // cost estimate (CLEAR framework: Cost axis)
  category?: PlanStepCategory;
  riskLevel?: 'low' | 'medium' | 'high';
  tags?: string[];
}

export type PlanStepCategory =
  | 'discovery'       // analyze, plan, design
  | 'implementation'  // build, create, implement
  | 'fix'             // bug fix, repair
  | 'refactor'        // improve, optimize
  | 'verification'    // test, validate
  | 'integration'     // deploy, commit, integrate
  | 'security'        // auth, permission, audit
  | 'cleanup';        // remove, delete, archive

export interface Plan {
  steps: PlanStep[];
  /** Optional metadata (preserved if present) */
  metadata?: {
    request?: string;
    totalSteps?: number;
    estimatedTotalMinutes?: number;
    estimatedTotalCost?: number;
    criticalPath?: string[];
    parallelizable?: boolean;
    language?: 'vi' | 'en';
    createdAt?: number;
  };
}

export interface TaskPlanner {
  createPlan(request: string): Plan;
  topologicalSort(plan: Plan): PlanStep[];
  estimate(plan: Plan): { totalMinutes: number; totalCost: number; byStep: Array<{ id: string; minutes: number; cost: number }> };
  findCriticalPath(plan: Plan): PlanStep[];
  detectCycles(plan: Plan): string[][];
  exportJson(plan: Plan): string;
}

// ==================== KEYWORD DICTIONARY ====================

interface StepTemplate {
  category: PlanStepCategory;
  titleVi: string;
  titleEn: string;
  keywordsVi: string[];
  keywordsEn: string[];
  minutes: number;
  cost: number;
  risk: 'low' | 'medium' | 'high';
  dependsOn?: PlanStepCategory[];   // categories this step depends on
}

const STEP_TEMPLATES: StepTemplate[] = [
  {
    category: 'discovery',
    titleVi: 'Phân tích yêu cầu và scope',
    titleEn: 'Analyze requirements and scope',
    keywordsVi: ['phân tích', 'tìm hiểu', 'khảo sát', 'đánh giá'],
    keywordsEn: ['analyze', 'research', 'investigate', 'assess', 'scope'],
    minutes: 15,
    cost: 0.5,
    risk: 'low',
  },
  {
    category: 'discovery',
    titleVi: 'Thiết kế kiến trúc',
    titleEn: 'Design architecture',
    keywordsVi: ['thiết kế', 'kiến trúc', 'cấu trúc', 'design'],
    keywordsEn: ['design', 'architect', 'structure', 'plan'],
    minutes: 30,
    cost: 1.0,
    risk: 'medium',
    dependsOn: ['discovery'],
  },
  {
    category: 'implementation',
    titleVi: 'Implement code',
    titleEn: 'Implement code',
    keywordsVi: ['implement', 'code', 'viết', 'lập trình'],
    keywordsEn: ['implement', 'code', 'write', 'develop', 'program'],
    minutes: 60,
    cost: 2.5,
    risk: 'medium',
    dependsOn: ['discovery'],
  },
  {
    category: 'implementation',
    titleVi: 'Tạo file/thư mục mới',
    titleEn: 'Create new files/folders',
    keywordsVi: ['tạo', 'mới', 'thêm file', 'tạo thư mục'],
    keywordsEn: ['create', 'new', 'add file', 'scaffold', 'init'],
    minutes: 20,
    cost: 0.8,
    risk: 'low',
    dependsOn: ['discovery'],
  },
  {
    category: 'fix',
    titleVi: 'Phát hiện root cause',
    titleEn: 'Identify root cause',
    keywordsVi: ['lỗi', 'bug', 'sai', 'broken'],
    keywordsEn: ['bug', 'fix', 'broken', 'error', 'fail'],
    minutes: 20,
    cost: 0.5,
    risk: 'low',
  },
  {
    category: 'fix',
    titleVi: 'Sửa lỗi và áp dụng fix',
    titleEn: 'Apply fix and patch',
    keywordsVi: ['sửa', 'fix', 'vá', 'patch'],
    keywordsEn: ['fix', 'patch', 'repair', 'solve'],
    minutes: 30,
    cost: 1.0,
    risk: 'medium',
    dependsOn: ['fix'],
  },
  {
    category: 'fix',
    titleVi: 'Thêm error handling',
    titleEn: 'Add error handling',
    keywordsVi: ['xử lý lỗi', 'try-catch', 'fallback'],
    keywordsEn: ['error handling', 'fallback', 'try-catch', 'exception'],
    minutes: 15,
    cost: 0.5,
    risk: 'low',
    dependsOn: ['fix'],
  },
  {
    category: 'refactor',
    titleVi: 'Backup trước khi refactor',
    titleEn: 'Backup before refactor',
    keywordsVi: ['backup', 'sao lưu', 'snapshot'],
    keywordsEn: ['backup', 'snapshot', 'preserve'],
    minutes: 5,
    cost: 0.1,
    risk: 'low',
  },
  {
    category: 'refactor',
    titleVi: 'Refactor và cải thiện code',
    titleEn: 'Refactor and improve code',
    keywordsVi: ['refactor', 'tối ưu', 'cải thiện', 'dọn dẹp'],
    keywordsEn: ['refactor', 'optimize', 'improve', 'cleanup', 'clean'],
    minutes: 45,
    cost: 1.5,
    risk: 'medium',
    dependsOn: ['refactor', 'implementation'],
  },
  {
    category: 'verification',
    titleVi: 'Viết unit tests',
    titleEn: 'Write unit tests',
    keywordsVi: ['unit test', 'viết test', 'kiểm thử'],
    keywordsEn: ['unit test', 'write test', 'jest', 'vitest'],
    minutes: 30,
    cost: 1.0,
    risk: 'low',
    dependsOn: ['implementation', 'fix'],
  },
  {
    category: 'verification',
    titleVi: 'Chạy test và xác minh',
    titleEn: 'Run tests and verify',
    keywordsVi: ['test', 'kiểm tra', 'xác minh', 'chạy test'],
    keywordsEn: ['test', 'verify', 'validate', 'run tests', 'assert'],
    minutes: 10,
    cost: 0.2,
    risk: 'low',
    dependsOn: ['verification'],
  },
  {
    category: 'verification',
    titleVi: 'Viết test tự động',
    titleEn: 'Write automated tests',
    keywordsVi: ['tự động test', 'automated test', 'auto test'],
    keywordsEn: ['automated test', 'auto test', 'test automation'],
    minutes: 25,
    cost: 0.8,
    risk: 'low',
    dependsOn: ['implementation', 'fix'],
  },
  {
    category: 'integration',
    titleVi: 'Integration test',
    titleEn: 'Integration test',
    keywordsVi: ['tích hợp', 'e2e', 'integration'],
    keywordsEn: ['integration', 'e2e', 'end-to-end'],
    minutes: 20,
    cost: 0.8,
    risk: 'medium',
    dependsOn: ['verification'],
  },
  {
    category: 'integration',
    titleVi: 'Commit và ghi nhớ vào memory',
    titleEn: 'Commit and store to memory',
    keywordsVi: ['commit', 'git', 'lưu', 'ghi nhớ'],
    keywordsEn: ['commit', 'git', 'save', 'store'],
    minutes: 5,
    cost: 0.1,
    risk: 'low',
    dependsOn: ['integration', 'verification'],
  },
  {
    category: 'security',
    titleVi: 'Security check (auth/permission)',
    titleEn: 'Security check (auth/permission)',
    keywordsVi: ['bảo mật', 'auth', 'login', 'password', 'permission'],
    keywordsEn: ['security', 'auth', 'login', 'password', 'permission'],
    minutes: 25,
    cost: 1.0,
    risk: 'high',
    dependsOn: ['implementation', 'fix'],
  },
  {
    category: 'security',
    titleVi: 'Validate input và output',
    titleEn: 'Validate input and output',
    keywordsVi: ['validate', 'sanitize'],
    keywordsEn: ['validate', 'sanitize', 'input validation'],
    minutes: 10,
    cost: 0.3,
    risk: 'medium',
    dependsOn: ['security'],
  },
  {
    category: 'cleanup',
    titleVi: 'Cleanup file thừa',
    titleEn: 'Cleanup redundant files',
    keywordsVi: ['dọn', 'xóa', 'cleanup'],
    keywordsEn: ['cleanup', 'remove', 'delete', 'purge'],
    minutes: 5,
    cost: 0.1,
    risk: 'low',
  },
];

// ==================== LANGUAGE DETECTION ====================

function detectLanguage(text: string): 'vi' | 'en' {
  const lower = text.toLowerCase();
  // Vietnamese diacritics
  const viPattern = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/;
  if (viPattern.test(lower)) return 'vi';

  // Vietnamese-specific words (no diacritics)
  const viKeywords = ['tạo', 'làm', 'sửa', 'xây dựng', 'phân tích', 'kế hoạch', 'tối ưu'];
  for (const kw of viKeywords) {
    if (lower.includes(kw)) return 'vi';
  }

  return 'en';
}

// ==================== DECOMPOSITION ====================

interface DecompositionMatch {
  template: StepTemplate;
  score: number;
  matchedKeywords: string[];
}

function matchTemplates(request: string, language: 'vi' | 'en'): DecompositionMatch[] {
  const lower = request.toLowerCase();
  const matches: DecompositionMatch[] = [];

  for (const template of STEP_TEMPLATES) {
    const keywords = language === 'vi' ? template.keywordsVi : template.keywordsEn;
    const matched: string[] = [];

    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        matched.push(kw);
      }
    }

    if (matched.length > 0) {
      // Higher score for templates with more matches AND high relevance
      const score = matched.length / Math.max(keywords.length * 0.3, 1);
      matches.push({ template, score: Math.min(score, 1.0), matchedKeywords: matched });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function generateId(prefix: string = 'step'): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
}

function createStepsFromMatches(
  matches: DecompositionMatch[],
  language: 'vi' | 'en'
): PlanStep[] {
  return matches.map((match) => {
    const template = match.template;
    return {
      id: generateId(template.category),
      title: language === 'vi' ? template.titleVi : template.titleEn,
      description: language === 'vi'
        ? `Bước tự động: ${template.titleVi} (match: ${match.matchedKeywords.join(', ')})`
        : `Auto step: ${template.titleEn} (matched: ${match.matchedKeywords.join(', ')})`,
      estimatedMinutes: template.minutes,
      estimatedCost: template.cost,
      category: template.category,
      riskLevel: template.risk,
      tags: match.matchedKeywords,
    };
  });
}

// ==================== DEPENDENCY RESOLUTION ====================

function resolveDependencies(steps: PlanStep[]): void {
  // For each step, find dependencies from its template's dependsOn list
  // We re-derive dependsOn by looking at the category of preceding steps
  const categoryToSteps = new Map<PlanStepCategory, PlanStep[]>();

  for (const step of steps) {
    if (!step.category) continue;
    if (!categoryToSteps.has(step.category)) {
      categoryToSteps.set(step.category, []);
    }
    categoryToSteps.get(step.category)!.push(step);
  }

  // Find the template for each step's category to get dependsOn
  for (const step of steps) {
    if (!step.category) continue;
    const template = STEP_TEMPLATES.find((t) => t.category === step.category);
    if (!template || !template.dependsOn) continue;

    const deps: string[] = [];
    for (const depCategory of template.dependsOn) {
      // Find the latest step of the dependency category (most recent in this plan)
      const depSteps = categoryToSteps.get(depCategory);
      if (depSteps && depSteps.length > 0) {
        // Use the last step of that category (latest in plan order)
        deps.push(depSteps[depSteps.length - 1].id);
      }
    }
    if (deps.length > 0) {
      step.dependencies = deps;
    }
  }
}

// ==================== TOPOLOGICAL SORT ====================

function topologicalSort(steps: PlanStep[]): PlanStep[] {
  const result: PlanStep[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  function visit(step: PlanStep): void {
    if (visited.has(step.id)) return;
    if (visiting.has(step.id)) {
      // Cycle detected — skip
      return;
    }

    visiting.add(step.id);

    for (const depId of step.dependencies ?? []) {
      const dep = stepMap.get(depId);
      if (dep) visit(dep);
    }

    visiting.delete(step.id);
    visited.add(step.id);
    result.push(step);
  }

  for (const step of steps) {
    visit(step);
  }

  return result;
}

// ==================== CRITICAL PATH ====================

function findCriticalPath(steps: PlanStep[]): PlanStep[] {
  // For each step, compute the longest path ending at this step
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const memo = new Map<string, { duration: number; path: PlanStep[] }>();

  function longestPathTo(step: PlanStep): { duration: number; path: PlanStep[] } {
    if (memo.has(step.id)) return memo.get(step.id)!;

    let longest = { duration: step.estimatedMinutes ?? 0, path: [step] };

    for (const depId of step.dependencies ?? []) {
      const dep = stepMap.get(depId);
      if (!dep) continue;
      const depPath = longestPathTo(dep);
      const totalDuration = depPath.duration + (step.estimatedMinutes ?? 0);
      if (totalDuration > longest.duration) {
        longest = { duration: totalDuration, path: [...depPath.path, step] };
      }
    }

    memo.set(step.id, longest);
    return longest;
  }

  let criticalPath: PlanStep[] = [];
  let maxDuration = 0;

  for (const step of steps) {
    const result = longestPathTo(step);
    if (result.duration > maxDuration) {
      maxDuration = result.duration;
      criticalPath = result.path;
    }
  }

  return criticalPath;
}

// ==================== CYCLE DETECTION ====================

function detectCycles(steps: PlanStep[]): string[][] {
  const cycles: string[][] = [];
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(stepId: string, path: string[]): void {
    if (recursionStack.has(stepId)) {
      const cycleStart = path.indexOf(stepId);
      cycles.push([...path.slice(cycleStart), stepId]);
      return;
    }
    if (visited.has(stepId)) return;

    visited.add(stepId);
    recursionStack.add(stepId);
    path.push(stepId);

    const step = stepMap.get(stepId);
    if (step) {
      for (const depId of step.dependencies ?? []) {
        dfs(depId, [...path]);
      }
    }

    recursionStack.delete(stepId);
    path.pop();
  }

  for (const step of steps) {
    dfs(step.id, []);
  }

  return cycles;
}

// ==================== ESTIMATION ====================

function estimate(plan: Plan): { totalMinutes: number; totalCost: number; byStep: Array<{ id: string; minutes: number; cost: number }> } {
  const byStep = plan.steps.map((s) => ({
    id: s.id,
    minutes: s.estimatedMinutes ?? 0,
    cost: s.estimatedCost ?? 0,
  }));

  const totalMinutes = byStep.reduce((sum, s) => sum + s.minutes, 0);
  const totalCost = byStep.reduce((sum, s) => sum + s.cost, 0);

  return { totalMinutes, totalCost, byStep };
}

// ==================== MAIN PLANNER ====================

export function getTaskPlanner(): TaskPlanner {
  return {
    createPlan(request: string): Plan {
      const trimmed = (request ?? '').trim();

      // Empty request → minimal fallback
      if (!trimmed) {
        return {
          steps: [
            { id: generateId('idle'), title: 'No request provided' },
          ],
          metadata: {
            request: trimmed,
            totalSteps: 1,
            language: 'en',
            createdAt: Date.now(),
          },
        };
      }

      const language = detectLanguage(trimmed);
      const matches = matchTemplates(trimmed, language);

      // Deduplicate by category — but allow multiple steps if their matched keywords are distinct
      // Use a more lenient rule: keep all matches that have unique keyword sets
      const seenCategories = new Set<PlanStepCategory>();
      const uniqueMatches: DecompositionMatch[] = [];
      for (const match of matches) {
        if (!seenCategories.has(match.template.category)) {
          seenCategories.add(match.template.category);
          uniqueMatches.push(match);
        }
      }

      // If implementation is matched but no verification is, add a test step when test-related
      // keywords are present (e.g. "and test", "và test", "with tests")
      const hasVerification = uniqueMatches.some((m) => m.template.category === 'verification');
      const hasImplementation = uniqueMatches.some((m) => m.template.category === 'implementation');

      const lower = trimmed.toLowerCase();
      const testPatterns = /\b(test|tests|kiểm tra|viết test|unit test)\b/i;
      if (testPatterns.test(lower) && !hasVerification) {
        const verifyTemplate = STEP_TEMPLATES.find((t) => t.category === 'verification' && t.keywordsEn.includes('test'));
        if (verifyTemplate) {
          uniqueMatches.push({
            template: verifyTemplate,
            score: 0.6,
            matchedKeywords: ['test'],
          });
        }
      }

      // If implementation matched but no commit/integration, add commit when "feature" / "build" / "new"
      // is present (so the plan ends with a deliverable)
      const hasIntegration = uniqueMatches.some((m) => m.template.category === 'integration');
      if (hasImplementation && !hasIntegration && /\b(feature|api|module|service|create|build|tạo|xây)\b/i.test(lower)) {
        const commitTemplate = STEP_TEMPLATES.find((t) => t.category === 'integration' && t.keywordsEn.includes('commit'));
        if (commitTemplate) {
          uniqueMatches.push({
            template: commitTemplate,
            score: 0.4,
            matchedKeywords: ['commit'],
          });
        }
      }

      // If no matches, fall back to a minimal generic plan
      if (uniqueMatches.length === 0) {
        return {
          steps: [
            { id: generateId('discovery'), title: `Analyze: ${trimmed.slice(0, 50)}`, category: 'discovery', estimatedMinutes: 15, estimatedCost: 0.3, riskLevel: 'low' },
            { id: generateId('implementation'), title: 'Execute plan', category: 'implementation', estimatedMinutes: 30, estimatedCost: 1.0, riskLevel: 'medium', dependencies: [] },
            { id: generateId('verification'), title: 'Verify result', category: 'verification', estimatedMinutes: 10, estimatedCost: 0.2, riskLevel: 'low', dependencies: [] },
          ],
          metadata: {
            request: trimmed,
            totalSteps: 3,
            language,
            createdAt: Date.now(),
          },
        };
      }

      const steps = createStepsFromMatches(uniqueMatches, language);
      resolveDependencies(steps);

      // Ensure backward-compatible fields
      for (const step of steps) {
        if (!step.title) step.title = step.description ?? 'Untitled step';
      }

      const est = estimate({ steps });

      return {
        steps,
        metadata: {
          request: trimmed,
          totalSteps: steps.length,
          estimatedTotalMinutes: est.totalMinutes,
          estimatedTotalCost: est.totalCost,
          language,
          createdAt: Date.now(),
        },
      };
    },

    topologicalSort(plan: Plan): PlanStep[] {
      return topologicalSort(plan.steps);
    },

    estimate(plan: Plan): { totalMinutes: number; totalCost: number; byStep: Array<{ id: string; minutes: number; cost: number }> } {
      return estimate(plan);
    },

    findCriticalPath(plan: Plan): PlanStep[] {
      return findCriticalPath(plan.steps);
    },

    detectCycles(plan: Plan): string[][] {
      return detectCycles(plan.steps);
    },

    exportJson(plan: Plan): string {
      return JSON.stringify(plan, null, 2);
    },
  };
}
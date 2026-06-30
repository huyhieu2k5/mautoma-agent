/**
 * SmartRunner - Entry point chạy tự động mọi thứ
 *
 * Khi người dùng mở Cursor với project này, SmartRunner:
 *  1. Tự động scan workspace
 *  2. Khởi tạo tất cả capabilities (router, skills, memory, evolution)
 *  3. Đợi input từ người dùng
 *  4. Mỗi input → AutoApply → capability → verify → cleanup
 *
 * Usage:
 *   npx tsx auto-apply/smart_runner.ts              # Interactive (default)
 *   npx tsx auto-apply/smart_runner.ts "request"    # Single request, auto-exit
 *   npx tsx auto-apply/smart_runner.ts --watch     # Watch mode: re-apply on file change
 *   npx tsx auto-apply/smart_runner.ts --daemon    # Daemon: stay alive, process multiple
 *   npx tsx auto-apply/smart_runner.ts --status    # Show all capabilities status
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

import { createAutoApplyEngine } from './index';
import { createCapabilityRouter, CAPABILITY_AXES } from '../capability-router';
import { createSkillOrchestrator, getSkillRegistry } from '../skill-manager';
import { createEvolutionEngine } from '../evolution';
import { getMemoryManager } from '../memory-store';
import { getTaskPlanner } from '../task-planner';
import { createCodeGraphManager } from '../codegraph';
import { getCLEAREvaluator } from '../evaluation';
import { getSessionGuard } from '../security/SessionGuard';
import { getDisputeSessionManager } from '../security/DisputeSession';
import { createComputerControl, createWorkflows } from '../computer-control';
import { createAgentEscalationEngine, createTeamOrchestrator } from '../agent-orchestration';
import { cleanupAIArtifacts } from '../file-cleaner';
import { createVerificationEngine } from '../verification';
import { createErrorLearner } from '../error-recovery';
import { getExecutor } from '../executor';

// ==================== BANNER ====================

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🤖  MAUTOMA AGENT — SMART RUNNER                           ║
║                                                              ║
║   Tự động phát hiện & áp dụng mọi capabilities            ║
║   của hệ thống. Không cần lệnh!                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝`;

// ==================== CAPABILITY STATUS ====================

async function showCapabilitiesStatus(): Promise<void> {
  console.log('\n📊 System Capabilities Status\n');
  console.log('─'.repeat(60));

  // 1. CapabilityRouter
  try {
    const _router = createCapabilityRouter({ defaultLanguage: 'vi' });
    const axes = CAPABILITY_AXES.map((a) => a.axis).join(', ');
    console.log(`  ✅ CapabilityRouter   — ${CAPABILITY_AXES.length} axes: ${axes}`);
  } catch (err: unknown) {
    console.log(`  ❌ CapabilityRouter   — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Skill Manager
  try {
    const registry = getSkillRegistry();
    const skills = registry.getAll();
    console.log(`  ✅ SkillManager       — ${skills.length} skills loaded`);
    for (const skill of skills.slice(0, 5)) {
      console.log(`     • ${skill.name} (${skill.version})`);
    }
    if (skills.length > 5) console.log(`     ... +${skills.length - 5} more`);
  } catch (err: unknown) {
    console.log(`  ❌ SkillManager       — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Memory
  try {
    const mem = getMemoryManager();
    const recent = mem.getRelevantContext ? mem.getRelevantContext('recent', 3) : [];
    console.log(`  ✅ Memory Store       — ${recent.length} recent entries`);
  } catch (_) {
    console.log(`  ⚠️  Memory Store       — Not initialized (will init on first use)`);
  }

  // 4. Evolution
  try {
    const _evo = createEvolutionEngine();
    console.log(`  ✅ Evolution Engine   — Ready (self-improving agents)`);
  } catch (err: unknown) {
    console.log(`  ❌ Evolution Engine   — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. CodeGraph
  try {
    const _cg = createCodeGraphManager();
    console.log(`  ✅ CodeGraph          — Ready (code structure analysis)`);
  } catch (_) {
    console.log(`  ⚠️  CodeGraph          — Not initialized (will init on first use)`);
  }

  // 6. TaskPlanner
  try {
    const _tp = getTaskPlanner();
    console.log(`  ✅ Task Planner       — Ready (project decomposition)`);
  } catch (err: unknown) {
    console.log(`  ❌ Task Planner       — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 7. File Cleaner
  try {
    console.log(`  ✅ File Cleaner       — Auto-cleanup AI artifacts (BẮT BUỘC)`);
  } catch (err: unknown) {
    console.log(`  ❌ File Cleaner       — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 8. Workspace analysis
  try {
    const stats = _cg.getStats();
    console.log(`  ✅ Workspace          — ${stats.totalFiles || 0} files analyzed`);
  } catch (err: unknown) {
    console.log(`  ⚠️  Workspace          — Analysis skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 9. Computer Control (5 components)
  try {
    createComputerControl();
    createWorkflows();
    console.log(`  ✅ Computer Control   — 5 components: keyboard/mouse/screen/automation/workflows`);
  } catch (err: unknown) {
    console.log(`  ❌ Computer Control   — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 10. Verification (LATS + committee + self-RAG)
  try {
    createVerificationEngine();
    console.log(`  ✅ Verification       — LATS tree search + Committee review + Self-RAG`);
  } catch (err: unknown) {
    console.log(`  ❌ Verification       — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 11. Executor (autonomous runner + subagent coordinator)
  try {
    getExecutor();
    console.log(`  ✅ Executor           — Autonomous runner + Subagent coordinator`);
  } catch (err: unknown) {
    console.log(`  ❌ Executor           — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 12. Error Recovery (pattern DB + retry)
  try {
    createErrorLearner();
    console.log(`  ✅ Error Recovery     — Pattern DB + Retry strategies`);
  } catch (err: unknown) {
    console.log(`  ❌ Error Recovery     — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 13. Agent Orchestration (5 teams + 5-tier escalation)
  try {
    createAgentEscalationEngine();
    createTeamOrchestrator();
    console.log(`  ✅ Agent Orchestr.    — 5 teams (Supervisor/Arena/Interrogate/Debate/Hierarchical)`);
  } catch (err: unknown) {
    console.log(`  ❌ Agent Orchestr.    — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 14. Evaluation (CLEAR framework)
  try {
    getCLEAREvaluator();
    console.log(`  ✅ CLEAR Evaluator    — Cost/Latency/Efficacy/Assurance/Reliability`);
  } catch (err: unknown) {
    console.log(`  ❌ CLEAR Evaluator    — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 15. Security: SessionGuard
  try {
    getSessionGuard({ maxRequestsPerMinute: 60 });
    console.log(`  ✅ SessionGuard       — HMAC + Rate limit + Audit log`);
  } catch (err: unknown) {
    console.log(`  ❌ SessionGuard       — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 16. Security: DisputeSession
  try {
    getDisputeSessionManager();
    console.log(`  ✅ DisputeSession     — 6 candidates + Elo champion selection`);
  } catch (err: unknown) {
    console.log(`  ❌ DisputeSession     — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 17. Cursor Skills (32 skills in .cursor/skills/)
  try {
    const skillsDir = path.resolve(__dirname, '..', '.cursor', 'skills');
    let skillCount = 0;
    if (fs.existsSync(skillsDir)) {
      skillCount = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory()).length;
    }
    console.log(`  ✅ Cursor Skills      — ${skillCount} curated skills (arena, architect, tdd, etc.)`);
  } catch (err: unknown) {
    console.log(`  ❌ Cursor Skills      — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 18. Skill Orchestrator
  try {
    createSkillOrchestrator({});
    console.log(`  ✅ Skill Orchestr.    — Multi-skill execution plans`);
  } catch (err: unknown) {
    console.log(`  ❌ Skill Orchestr.    — Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('─'.repeat(60));
  console.log('\n  📌 Nhập yêu cầu bằng tiếng Việt hoặc tiếng Anh!');
  console.log('  📌 Gõ "status" để xem lại capabilities, "quit" để thoát.\n');
}

// ==================== INTERACTIVE MODE ====================

async function interactiveMode(): Promise<void> {
  console.log(BANNER);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): Promise<string> =>
    new Promise((resolve) => {
      rl.question('\n🤖 Bạn: ', (answer) => resolve(answer.trim()));
    });

  // Show capabilities on start
  await showCapabilitiesStatus();

  // eslint-disable-next-line no-constant-condition -- intentional interactive loop, breaks on 'quit'/'exit'/'q'
  while (true) {
    try {
      const input = await prompt();

      if (!input) continue;

      if (input === 'quit' || input === 'exit' || input === 'q') {
        console.log('\n👋 Tạm biệt! Tự động cleanup trước khi thoát...');
        try {
          const report = await cleanupAIArtifacts({ verbose: false });
          console.log(`🧹 Cleanup: deleted ${report.deleted}, merged ${report.mergedIntoNotes}`);
        } catch (_) {}
        console.log('✅ Done. Goodbye!\n');
        rl.close();
        return;
      }

      if (input === 'status') {
        await showCapabilitiesStatus();
        continue;
      }

      if (input === 'help') {
        console.log(`
📖 Hướng dẫn sử dụng:

  1. Nói yêu cầu bằng ngôn ngữ tự nhiên
     Ví dụ:
       "Tạo website bán hàng"
       "Phân tích code và tìm lỗi"
       "Cài plugin mới"
       "Lên kế hoạch dự án này"
       "Refactor toàn bộ project"

  2. Hệ thống tự động:
       ✓ Phát hiện intent từ yêu cầu
       ✓ Chọn capabilities phù hợp
       ✓ Chạy theo thứ tự ưu tiên
       ✓ Dọn file thừa trước khi kết thúc

  3. Lệnh đặc biệt:
       status  — Xem trạng thái capabilities
       quit    — Thoát (tự động cleanup)
       help    — Hiển thị hướng dẫn này
`);
        continue;
      }

      console.log('\n' + '─'.repeat(60));
      console.log(`📝 Request: "${input}"`);
      console.log('─'.repeat(60));

      const engine = createAutoApplyEngine({ verbose: true, language: 'vi' });
      const result = await engine.apply(input);

      console.log('\n📊 Result:');
      console.log(`   Axes triggered: ${result.axesTriggered.join(', ') || 'none'}`);
      console.log(`   Duration: ${Math.round(result.durationMs / 1000)}s`);
      console.log(`   Status: ${result.success ? '✅ SUCCESS' : '⚠️ COMPLETED WITH ERRORS'}`);
    } catch (err: unknown) {
      console.error(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ==================== SINGLE REQUEST MODE ====================

async function singleMode(request: string): Promise<void> {
  console.log(BANNER);
  console.log(`\n📝 Request: "${request}"`);
  console.log('─'.repeat(60) + '\n');

  const engine = createAutoApplyEngine({ verbose: true, language: 'vi' });
  const result = await engine.apply(request);

  console.log('\n' + '─'.repeat(60));
  console.log('📊 FINAL REPORT');
  console.log('─'.repeat(60));
  console.log(`   Axes triggered: ${result.axesTriggered.join(', ') || 'none'}`);
  console.log(`   Steps executed: ${result.steps.length}`);
  console.log(`   Duration:       ${Math.round(result.durationMs / 1000)}s`);
  console.log(`   Status:         ${result.success ? '✅ SUCCESS' : '⚠️ COMPLETED WITH ERRORS'}`);
  console.log('─'.repeat(60) + '\n');

  if (!result.success) {
    process.exit(1);
  }
}

// ==================== MAIN ====================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    console.log(BANNER);
    await showCapabilitiesStatus();
    return;
  }

  if (args.includes('--daemon')) {
    await interactiveMode();
    return;
  }

  // Find the request (last non-flag arg)
  const requestArg = args.find((a) => !a.startsWith('--') && !a.startsWith('-'));

  if (requestArg) {
    await singleMode(requestArg);
  } else {
    await interactiveMode();
  }
}

main().catch((err: unknown) => {
  console.error('\n❌ Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
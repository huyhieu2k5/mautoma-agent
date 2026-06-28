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

import { autoApply, createAutoApplyEngine } from './index';
import { createCapabilityRouter, CAPABILITY_AXES } from '../capability-router';
import { createSkillOrchestrator, getSkillRegistry } from '../skill-manager';
import { createEvolutionEngine } from '../evolution';
import { createMemoryManager } from '../memory-store';
import { createTaskPlanner } from '../task-planner';
import { createCodeGraphAnalyzer } from '../codegraph';
import { cleanupAIArtifacts } from '../file-cleaner';

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
    const router = createCapabilityRouter({ defaultLanguage: 'vi' });
    const axes = CAPABILITY_AXES.map((a) => a.axis).join(', ');
    console.log(`  ✅ CapabilityRouter   — ${CAPABILITY_AXES.length} axes: ${axes}`);
  } catch (err: any) {
    console.log(`  ❌ CapabilityRouter   — Error: ${err.message}`);
  }

  // 2. Skill Manager
  try {
    const registry = getSkillRegistry();
    const skills = registry.listSkills();
    console.log(`  ✅ SkillManager       — ${skills.length} skills loaded`);
    for (const skill of skills.slice(0, 5)) {
      console.log(`     • ${skill.name} (${skill.version})`);
    }
    if (skills.length > 5) console.log(`     ... +${skills.length - 5} more`);
  } catch (err: any) {
    console.log(`  ❌ SkillManager       — Error: ${err.message}`);
  }

  // 3. Memory
  try {
    const mem = createMemoryManager();
    const recent = await mem.getRecent(3);
    console.log(`  ✅ Memory Store       — ${recent.length} recent entries`);
  } catch (err: any) {
    console.log(`  ❌ Memory Store       — Error: ${err.message}`);
  }

  // 4. Evolution
  try {
    const evo = createEvolutionEngine();
    console.log(`  ✅ Evolution Engine   — Ready (self-improving agents)`);
  } catch (err: any) {
    console.log(`  ❌ Evolution Engine   — Error: ${err.message}`);
  }

  // 5. CodeGraph
  try {
    const cg = createCodeGraphAnalyzer();
    console.log(`  ✅ CodeGraph          — Ready (code structure analysis)`);
  } catch (err: any) {
    console.log(`  ❌ CodeGraph          — Error: ${err.message}`);
  }

  // 6. TaskPlanner
  try {
    const tp = createTaskPlanner();
    console.log(`  ✅ Task Planner       — Ready (project decomposition)`);
  } catch (err: any) {
    console.log(`  ❌ Task Planner       — Error: ${err.message}`);
  }

  // 7. File Cleaner
  try {
    console.log(`  ✅ File Cleaner       — Auto-cleanup AI artifacts (BẮT BUỘC)`);
  } catch (err: any) {
    console.log(`  ❌ File Cleaner       — Error: ${err.message}`);
  }

  // 8. Workspace analysis
  try {
    const cg = createCodeGraphAnalyzer();
    const root = process.cwd();
    const structure = cg.analyze(root, { depth: 1, includeTests: false });
    console.log(`  ✅ Workspace          — ${structure.totalFiles} files, ${structure.moduleCount} modules`);
  } catch (err: any) {
    console.log(`  ⚠️  Workspace          — Analysis skipped`);
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
    } catch (err: any) {
      console.error(`\n❌ Error: ${err.message}`);
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

main().catch((err) => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
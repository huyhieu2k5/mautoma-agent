/**
 * SmartRunner — Auto-running entry point
 *
 * When a user opens Cursor with this project, SmartRunner:
 *  1. Auto-scans the workspace
 *  2. Initializes all capabilities (router, skills, memory, evolution)
 *  3. Waits for user input
 *  4. For each input → AutoApply → capability → verify → cleanup
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
║   Automatically detect & apply every capability             ║
║   of the system. No commands needed!                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝`;

// ==================== CAPABILITY STATUS ====================

/** Safely extract a string message from an unknown thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Run a status check and print a row.
 * Returns true if `fn` succeeded, false otherwise.
 */
function statusRow(label: string, fn: () => string, _fallback = 'Not initialized'): boolean {
  try {
    const detail = fn();
    console.log(`  ✅ ${label.padEnd(22)} ${detail}`);
    return true;
  } catch (err) {
    console.log(`  ❌ ${label.padEnd(22)} Error: ${errorMessage(err)}`);
    return false;
  }
}

/** Same as statusRow but uses a ⚠️ marker when the call is expected to be optional. */
function statusRowSoft(label: string, fn: () => string, fallback = 'Not initialized'): void {
  try {
    const detail = fn();
    console.log(`  ✅ ${label.padEnd(22)} ${detail}`);
  } catch {
    console.log(`  ⚠️  ${label.padEnd(22)} ${fallback}`);
  }
}

async function showCapabilitiesStatus(): Promise<void> {
  console.log('\n📊 System Capabilities Status\n');
  console.log('─'.repeat(60));

  // 1. CapabilityRouter
  statusRow('CapabilityRouter', () => {
    const router = createCapabilityRouter({ defaultLanguage: 'vi' });
    const axes = CAPABILITY_AXES.map((a) => a.axis).join(', ');
    void router;
    return `${CAPABILITY_AXES.length} axes: ${axes}`;
  });

  // 2. Skill Manager
  statusRow('SkillManager', () => {
    const registry = getSkillRegistry();
    const skills = registry.getAll();
    for (const skill of skills.slice(0, 5)) {
      console.log(`     • ${skill.name} (${skill.version})`);
    }
    if (skills.length > 5) console.log(`     ... +${skills.length - 5} more`);
    return `${skills.length} skills loaded`;
  });

  // 3. Memory
  statusRowSoft(
    'Memory Store',
    () => {
      const mem = getMemoryManager();
      const recent = mem.getRelevantContext ? mem.getRelevantContext('recent', 3) : [];
      return `${recent.length} recent entries`;
    },
    'Not initialized (will init on first use)'
  );

  // 4. Evolution
  statusRow('Evolution Engine', () => {
    void createEvolutionEngine();
    return 'Ready (self-improving agents)';
  });

  // 5. CodeGraph
  statusRowSoft(
    'CodeGraph',
    () => {
      void createCodeGraphManager();
      return 'Ready (code structure analysis)';
    },
    'Not initialized (will init on first use)'
  );

  // 6. TaskPlanner
  statusRow('Task Planner', () => {
    void getTaskPlanner();
    return 'Ready (project decomposition)';
  });

  // 7. File Cleaner
  statusRow('File Cleaner', () => 'Auto-cleanup AI artifacts (REQUIRED)');

  // 8. Workspace analysis
  statusRowSoft(
    'Workspace',
    () => {
      const cg = createCodeGraphManager();
      const stats = cg.getStats();
      return `${stats.totalFiles || 0} files analyzed`;
    },
    'Analysis skipped'
  );

  // 9. Computer Control
  statusRow('Computer Control', () => {
    void createComputerControl();
    void createWorkflows();
    return '5 components: keyboard/mouse/screen/automation/workflows';
  });

  // 10. Verification
  statusRow('Verification', () => {
    void createVerificationEngine();
    return 'LATS tree search + Committee review + Self-RAG';
  });

  // 11. Executor
  statusRow('Executor', () => {
    void getExecutor();
    return 'Autonomous runner + Subagent coordinator';
  });

  // 12. Error Recovery
  statusRow('Error Recovery', () => {
    void createErrorLearner();
    return 'Pattern DB + Retry strategies';
  });

  // 13. Agent Orchestration
  statusRow('Agent Orchestr.', () => {
    void createAgentEscalationEngine();
    void createTeamOrchestrator();
    return '5 teams (Supervisor/Arena/Interrogate/Debate/Hierarchical)';
  });

  // 14. CLEAR Evaluation
  statusRow('CLEAR Evaluator', () => {
    void getCLEAREvaluator();
    return 'Cost/Latency/Efficacy/Assurance/Reliability';
  });

  // 15. SessionGuard
  statusRow('SessionGuard', () => {
    void getSessionGuard({ maxRequestsPerMinute: 60 });
    return 'HMAC + Rate limit + Audit log';
  });

  // 16. DisputeSession
  statusRow('DisputeSession', () => {
    void getDisputeSessionManager();
    return '6 candidates + Elo champion selection';
  });

  // 17. Cursor Skills
  statusRow('Cursor Skills', () => {
    const skillsDir = path.resolve(__dirname, '..', '.cursor', 'skills');
    let count = 0;
    if (fs.existsSync(skillsDir)) {
      count = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
    }
    return `${count} curated skills (arena, architect, tdd, etc.)`;
  });

  // 18. Skill Orchestrator
  statusRow('Skill Orchestr.', () => {
    void createSkillOrchestrator({});
    return 'Multi-skill execution plans';
  });

  console.log('─'.repeat(60));
  console.log('\n  📌 Enter your request in Vietnamese or English!');
  console.log('  📌 Type "status" to see capabilities, "quit" to exit.\n');
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
      rl.question('\n🤖 You: ', (answer) => resolve(answer.trim()));
    });

  // Show capabilities on start
  await showCapabilitiesStatus();

  // eslint-disable-next-line no-constant-condition -- intentional interactive loop, breaks on 'quit'/'exit'/'q'
  while (true) {
    try {
      const input = await prompt();

      if (!input) continue;

      if (input === 'quit' || input === 'exit' || input === 'q') {
        console.log('\n👋 Goodbye! Auto cleanup before exit...');
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
📖 Usage:

  1. State your request in natural language
     Examples:
       "Create an e-commerce website"
       "Analyze the code and find bugs"
       "Install a new plugin"
       "Plan this project"
       "Refactor the entire project"

  2. The system automatically:
       ✓ Detects intent from the request
       ✓ Selects the right capabilities
       ✓ Runs them in priority order
       ✓ Cleans up leftover files before finishing

  3. Special commands:
       status  — Show capability status
       quit    — Exit (with auto cleanup)
       help    — Show this help
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
    } catch (err) {
      console.error(`\n❌ Error: ${errorMessage(err)}`);
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
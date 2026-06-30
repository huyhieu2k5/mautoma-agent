#!/usr/bin/env node
/**
 * agent_cli.ts — Interactive and daemon CLI for the mautoma-agent runtime.
 *
 * Modes:
 *   - (default)       Interactive: prompt for requests, apply, cleanup, repeat
 *   - --continuous    Process requests continuously from stdin (one per line)
 *   - --status        Show a single status snapshot of the AutoApply intent layers
 *   - --tasks         Print the queued tasks (in --continuous mode)
 *
 * Notes:
 *   The CapabilityRouter, evolution engine, memory store, codegraph, etc.
 *   referenced in the plugin manifest are not bundled in this snapshot.
 *   When their modules are missing, the CLI degrades gracefully — the
 *   intent-detection engine (auto-apply) and the file cleaner remain
 *   fully functional, and that is what the user-facing CLI relies on.
 */

import * as readline from 'readline';
import { autoApply, createAutoApplyEngine } from './auto-apply';
import { cleanupAIArtifacts } from './file-cleaner';

type Mode = 'interactive' | 'continuous' | 'status' | 'tasks';

interface CliOptions {
  mode: Mode;
  verbose: boolean;
  language: 'vi' | 'en';
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    mode: 'interactive',
    verbose: !argv.includes('--quiet'),
    language: 'vi',
  };

  for (const arg of argv) {
    switch (arg) {
      case '--continuous':
      case '-c':
        opts.mode = 'continuous';
        break;
      case '--status':
        opts.mode = 'status';
        break;
      case '--tasks':
        opts.mode = 'tasks';
        break;
      case '--quiet':
        opts.verbose = false;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--lang-en':
        opts.language = 'en';
        break;
      case '--lang-vi':
        opts.language = 'vi';
        break;
    }
  }
  return opts;
}

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║   🤖  mautoma-agent — Agent CLI                              ║
║      Auto-apply intent → capability → cleanup                ║
╚══════════════════════════════════════════════════════════════╝
`;

async function runInteractive(opts: CliOptions): Promise<void> {
  console.log(BANNER);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

  // eslint-disable-next-line no-constant-condition -- intentional interactive loop, breaks on 'quit'/'exit'/'q'
  while (true) {
    const input = await ask('\n🤖 mautoma> ');
    if (!input) continue;

    if (input === 'quit' || input === 'exit' || input === 'q') {
      console.log('\n🧹 Final cleanup...');
      try {
        const report = await cleanupAIArtifacts({ verbose: false });
        console.log(
          `🧹 Cleanup: deleted=${report.deleted}, merged=${report.mergedIntoNotes}`
        );
      } catch {
        // Cleanup is best-effort on exit.
      }
      console.log('👋 Goodbye!\n');
      rl.close();
      return;
    }

    if (input === 'help' || input === '?') {
      console.log(`
Commands:
  help, ?          Show this help
  status           Print system capability status
  quit, exit, q    Exit (with cleanup)

Otherwise, type any request — the engine detects intent and runs the
matching capability axes automatically.
`);
      continue;
    }

    if (input === 'status') {
      await printStatus(opts);
      continue;
    }

    const engine = createAutoApplyEngine({
      verbose: opts.verbose,
      language: opts.language,
    });

    const result = await engine.apply(input);
    printResult(result);
  }
}

async function runContinuous(opts: CliOptions): Promise<void> {
  console.log(BANNER);
  console.log('📥 Continuous mode: feed lines on stdin, "quit" to exit.\n');

  const rl = readline.createInterface({ input: process.stdin });
  const engine = createAutoApplyEngine({
    verbose: opts.verbose,
    language: opts.language,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === 'quit' || trimmed === 'exit') break;

    const result = await engine.apply(trimmed);
    printResult(result);
  }

  const report = await cleanupAIArtifacts({ verbose: false });
  console.log(`\n🧹 Final cleanup: deleted=${report.deleted}`);
}

async function printStatus(opts: CliOptions): Promise<void> {
  const engine = createAutoApplyEngine({
    verbose: false,
    language: opts.language,
  });
  const demo = engine.analyze('Phân tích code và refactor');

  console.log('\n📊 mautoma-agent status\n' + '─'.repeat(48));
  console.log('  ✅ AutoApply engine       — intent detection ready');
  console.log('  ✅ AI File Cleaner        — pre-exit cleanup ready');
  console.log('  ✅ CapabilityRouter CLI   — `npx tsx scripts/capability-router-cli.ts`');
  console.log('  ────────────────────────────────────────────────────');
  console.log(`  Demo intent (Vi): ${demo.length} axis(es)`);
  for (const intent of demo.slice(0, 5)) {
    console.log(
      `     • ${intent.axis.padEnd(20)} score=${intent.score.toFixed(2)}`
    );
  }
  console.log('─'.repeat(48) + '\n');
}

function printResult(result: Awaited<ReturnType<typeof autoApply>>): void {
  console.log('\n' + '─'.repeat(60));
  console.log('📊 Result');
  console.log('─'.repeat(60));
  console.log(`   Axes triggered: ${result.axesTriggered.join(', ') || '(none)'}`);
  console.log(`   Steps executed: ${result.steps.length}`);
  console.log(`   Duration:       ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log(
    `   Status:         ${result.success ? '✅ SUCCESS' : '⚠️  COMPLETED WITH WARNINGS'}`
  );
  console.log('─'.repeat(60) + '\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  try {
    if (opts.mode === 'status') {
      await printStatus(opts);
      return;
    }
    if (opts.mode === 'tasks') {
      console.log('No task queue exposed in this build (capability-router module not bundled).');
      return;
    }
    if (opts.mode === 'continuous') {
      await runContinuous(opts);
      return;
    }
    await runInteractive(opts);
  } catch (err) {
    console.error('\n❌ Fatal:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
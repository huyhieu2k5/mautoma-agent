/**
 * CapabilityRouter CLI — Entry point so every caller (Cursor parent agent,
 * subagent, hook, or user shell) can auto-route a raw request through
 * CapabilityRouter → dispute tournament → champion executes.
 *
 * No TypeScript knowledge needed, no import needed. Simple usage:
 *
 *   npx tsx scripts/capability-router-cli.ts --raw "Refactor my code"
 *   npx tsx scripts/capability-router-cli.ts --raw "Open Chrome" --language en
 *   npx tsx scripts/capability-router-cli.ts --raw "..." --json
 *
 * This implements "auto-apply every skill without the user having to ask":
 *   The Cursor parent agent / hook just shell-execs this command; the plugin
 *   routes the request → runs the dispute tournament → picks the champion →
 *   returns the primary axis + championId.
 *
 * Output:
 *   - Default: human-readable text (English)
 *   - --json:    JSON for machine consumption (easy for parent agent to parse)
 *
 * Exit code:
 *   0 = route success
 *   1 = input invalid
 *   2 = routing failed (graceful fallback still returns output)
 */

import { createCapabilityRouter } from '../capability-router';

interface CliArgs {
  raw: string;
  language?: 'vi' | 'en';
  json: boolean;
  skipDispute: boolean;
  confidenceThreshold: number;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    raw: '',
    json: false,
    skipDispute: false,
    confidenceThreshold: 0.4,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--raw':
      case '-r':
        if (!next) throw new Error('--raw requires a value');
        args.raw = next;
        i++;
        break;
      case '--language':
      case '-l':
        if (next !== 'vi' && next !== 'en') {
          throw new Error(`--language must be vi|en (got: ${next})`);
        }
        args.language = next;
        i++;
        break;
      case '--json':
        args.json = true;
        break;
      case '--skip-dispute':
        args.skipDispute = true;
        break;
      case '--confidence':
      case '-c': {
        const c = Number(next);
        if (isNaN(c) || c < 0 || c > 1) {
          throw new Error(`--confidence must be 0..1 (got: ${next})`);
        }
        args.confidenceThreshold = c;
        i++;
        break;
      }
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        // Allow positional raw text (first non-flag)
        if (!args.raw) args.raw = arg;
        break;
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
CapabilityRouter CLI — Auto-apply routing + dispute tournament for every request

USAGE:
  npx tsx scripts/capability-router-cli.ts --raw "<request text>" [options]

OPTIONS:
  --raw, -r <text>       Raw user request (REQUIRED, or pass as positional)
  --language, -l <vi|en> Force language (default: auto-detect)
  --confidence, -c <0-1> Confidence threshold (default: 0.4)
  --skip-dispute         Skip dispute tournament (testing only)
  --json                 Output JSON instead of text
  --help, -h             Show this help

EXAMPLES:
  # Route raw request (auto-detect language, run dispute)
  npx tsx scripts/capability-router-cli.ts --raw "Refactor my code"

  # English with JSON output (for parent agent parsing)
  npx tsx scripts/capability-router-cli.ts -r "Open Chrome" -l en --json

  # Positional raw text
  npx tsx scripts/capability-router-cli.ts "Verify the code passed tests"

OUTPUT (text mode):
  🎯 Primary axis:    <axis>
  📊 Score:           <0..1>
  🏆 Champion agent:  <championId>  (after dispute tournament)
  🆔 Dispute session: <sessionId>
  ⚡ Other axes:      [<axis1>, <axis2>, ...]

OUTPUT (JSON mode):
  { "primary": "...", "score": 0.85, "championId": "...", "disputeSessionId": "...", "axes": [...] }

EXIT CODES:
  0 = route success
  1 = input invalid (missing --raw, etc.)
  2 = routing internal failure (fallback still returns output)

NOTE: The plugin automatically applies routing for EVERY request when the
      Cursor parent agent shell-execs this command, or when hooks/auto-router.cjs
      triggers on each message.
`);
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    console.error('Use --help to see usage.');
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.raw || args.raw.trim().length === 0) {
    console.error('❌ Missing --raw <text>. Use --help to see usage.');
    process.exit(1);
  }

  const router = createCapabilityRouter({
    confidenceThreshold: args.confidenceThreshold,
    maxAxesPerRequest: 5,
    defaultLanguage: args.language ?? 'vi',
    autoExecute: false,
    runDisputeOnRoute: !args.skipDispute,
  });

  let exitCode = 0;
  try {
    const decision = await router.route({
      raw: args.raw,
      language: args.language,
    });

    if (args.json) {
      // JSON output cho parent agent parse
      process.stdout.write(JSON.stringify(decision, null, 2) + '\n');
    } else {
      // Human-readable
      const axesList = (decision.axes ?? [])
        .filter(a => a.axis !== decision.primary)
        .map(a => `${a.axis}(${a.score.toFixed(2)})`)
        .join(', ');
      const ds = decision.disputeSession;
      const championLine = decision.championId
        ? `${decision.championId} (dispute ${ds?.status ?? 'resolved'})`
        : 'skipped (runDisputeOnRoute=false)';

      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  CAPABILITY ROUTER — AUTO-APPLIED');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`📝 Raw request:    "${args.raw.slice(0, 80)}${args.raw.length > 80 ? '...' : ''}"`);
      console.log(`🌐 Language:       ${args.language ?? 'auto'}`);
      console.log(`🎯 Primary axis:   ${decision.primary}`);
      console.log(`📊 Score:          ${decision.score?.toFixed(3) ?? 'n/a'}`);
      console.log(`🏆 Champion agent: ${championLine}`);
      if (ds?.sessionId) {
        console.log(`🆔 Dispute session: ${ds.sessionId}`);
      }
      if (axesList) {
        console.log(`⚡ Other axes:     ${axesList}`);
      }
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('→ Champion will execute primary axis (skill/module auto-loaded)');
    }
  } catch (err) {
    exitCode = 2;
    const errMsg = (err as Error).message;
    if (args.json) {
      process.stdout.write(JSON.stringify({ error: errMsg, raw: args.raw }) + '\n');
    } else {
      console.error(`❌ Routing failed: ${errMsg}`);
      console.error('Fallback: the parent agent should handle this request manually with the capability router state.');
    }
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(2);
});
/**
 * CapabilityRouter CLI - Entry point để mọi caller (Cursor parent agent,
 * subagent, hook, hoặc user shell) đều có thể auto-route raw request qua
 * CapabilityRouter → dispute tournament → champion executes.
 *
 * Không cần biết TypeScript, không cần import. Gọi đơn giản:
 *
 *   npx tsx scripts/capability-router-cli.ts --raw "Refactor code của tôi"
 *   npx tsx scripts/capability-router-cli.ts --raw "Open Chrome" --language en
 *   npx tsx scripts/capability-router-cli.ts --raw "..." --json
 *
 * Đây là implementation của "tự động áp dụng mọi skills mà user không cần yêu cầu":
 *   Cursor parent agent / hook chỉ cần shell exec câu lệnh này, plugin sẽ tự routing
 *   → chạy dispute tournament → chọn champion → trả về primary axis + championId.
 *
 * Output:
 *   - Mặc định: human-readable text (Vietnamese)
 *   - --json:    JSON cho machine consumption (parent agent parse dễ)
 *
 * Exit code:
 *   0 = route success
 *   1 = input invalid
 *   2 = routing failed (graceful fallback vẫn trả output)
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
CapabilityRouter CLI - Auto-apply routing + dispute tournament cho mọi request

USAGE:
  npx tsx scripts/capability-router-cli.ts --raw "<request text>" [options]

OPTIONS:
  --raw, -r <text>       Raw user request (BẮT BUỘC, hoặc truyền positional)
  --language, -l <vi|en> Force language (mặc định: auto-detect)
  --confidence, -c <0-1> Confidence threshold (mặc định: 0.4)
  --skip-dispute         Skip dispute tournament (testing only)
  --json                 Output JSON thay vì text
  --help, -h             Show this help

EXAMPLES:
  # Route raw request (auto-detect language, run dispute)
  npx tsx scripts/capability-router-cli.ts --raw "Refactor code của tôi"

  # English with JSON output (cho parent agent parse)
  npx tsx scripts/capability-router-cli.ts -r "Open Chrome" -l en --json

  # Positional raw text
  npx tsx scripts/capability-router-cli.ts "Verify code đã pass test chưa"

OUTPUT (text mode):
  🎯 Primary axis:    <axis>
  📊 Score:           <0..1>
  🏆 Champion agent:  <championId>  (sau dispute tournament)
  🆔 Dispute session: <sessionId>
  ⚡ Other axes:      [<axis1>, <axis2>, ...]

OUTPUT (JSON mode):
  { "primary": "...", "score": 0.85, "championId": "...", "disputeSessionId": "...", "axes": [...] }

EXIT CODES:
  0 = route success
  1 = input invalid (missing --raw, etc.)
  2 = routing internal failure (fallback vẫn có output)

NOTE: Plugin tự động áp dụng routing cho MỌI request khi Cursor parent agent
      shell-exec lệnh này, hoặc khi hooks/auto-router.cjs trigger trên mỗi message.
`);
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    console.error('Use --help để xem usage.');
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.raw || args.raw.trim().length === 0) {
    console.error('❌ Thiếu --raw <text>. Dùng --help để xem usage.');
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
      console.log('→ Champion sẽ execute primary axis (skill/module auto-loaded)');
    }
  } catch (err) {
    exitCode = 2;
    const errMsg = (err as Error).message;
    if (args.json) {
      process.stdout.write(JSON.stringify({ error: errMsg, raw: args.raw }) + '\n');
    } else {
      console.error(`❌ Routing failed: ${errMsg}`);
      console.error('Fallback: parent agent nên xử lý request thủ công với capability router state.');
    }
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(2);
});
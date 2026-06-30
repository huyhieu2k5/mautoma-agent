/**
 * CLI: run the file cleaner quickly
 *
 * Usage:
 *   npx tsx file-cleaner/cli.ts [--dry-run] [--verbose] [--scan=dir1,dir2]
 */

import { cleanupAIArtifacts, removeNote } from './index';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const quiet = args.includes('--quiet');
  const verbose = !quiet;
  const scanArg = args.find((a) => a.startsWith('--scan='));
  const scanDirs = scanArg ? scanArg.split('=')[1]?.split(',').filter(Boolean) ?? [] : [];
  const removeArg = args.find((a) => a.startsWith('--remove-note='));

  if (removeArg) {
    const keyword = removeArg.split('=')[1] ?? '';
    const ok = removeNote(keyword);
    console.log(ok ? `[ok] Removed section matching "${keyword}"` : `[skip] No section matched "${keyword}"`);
    return;
  }

  const report = await cleanupAIArtifacts({ dryRun, verbose, scanDirs });

  console.log('\n═══════════════════════════════════════');
  console.log('  AI File Cleaner — Report');
  console.log('═══════════════════════════════════════');
  console.log(`  Scanned:           ${report.scanned}`);
  console.log(`  Flagged:           ${report.flagged}`);
  console.log(`  Deleted:           ${report.deleted}`);
  console.log(`  Merged → AI_NOTES: ${report.mergedIntoNotes}`);
  console.log(`  Duration:          ${report.durationMs} ms`);
  if (report.notesFile) {
    console.log(`  Notes file:        ${report.notesFile}`);
  }
  console.log('═══════════════════════════════════════\n');

  if (report.details.length > 0 && !quiet) {
    console.log('Details:');
    for (const item of report.details) {
      const icon =
        item.action === 'merged_into_notes' ? '📝' : '🗑️';
      console.log(`  ${icon} [${item.action}] ${item.file}`);
      console.log(`       reason: ${item.reason}`);
      console.log(`       size:   ${item.size} bytes`);
    }
  }
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
#!/usr/bin/env node
/**
 * Rewrite git history: replace all author emails with huyhieu2k5's email.
 * Uses git fast-export / fast-import for clean stream-based rewriting.
 *
 * Usage:
 *   node scripts/rewrite-authors.cjs
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const NEW_NAME = 'huyhieu2k5';
const NEW_EMAIL = 'hahuyhieu0398765114@gmail.com';
const REF_TO_REWRITE = 'refs/heads/main';

// Run a git command, return stdout as string
function git(args, opts = {}) {
  const res = spawnSync('git', args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    env: process.env,
    ...opts,
  });
  if (res.status !== 0) {
    console.error('git failed:', args.join(' '));
    console.error(res.stderr);
    process.exit(res.status || 1);
  }
  return res.stdout;
}

// Stream-rewrite the fast-export output: change author/committer fields
function rewriteExport(input, output) {
  let inCommit = false;
  let pendingAuthor = null;
  let pendingCommitter = null;
  let buffer = '';

  // Line-by-line stream processing
  // fast-export format for commit:
  //   commit <ref>
  //   mark :<n>
  //   author <name> <email> <timestamp> <tz>
  //   committer <name> <email> <timestamp> <tz>
  //   data <size>
  //   <commit message>
  //   [from ...] [merge ...]
  //   [file modification ops]
  //
  // We rewrite author/committer lines when their email is NOT the new one.

  const readable = require('stream').Readable.from(input);
  const writable = require('stream').Writable({
    write(chunk, _enc, cb) {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        process.stdout.write(rewriteLine(line) + '\n', () => {});
      }
      cb();
    },
    final(cb) {
      if (buffer.length > 0) {
        process.stdout.write(rewriteLine(buffer) + '\n', () => {});
      }
      cb();
    },
  });

  function rewriteLine(line) {
    // Match "author <name> <email> <timestamp> <tz>"
    let m = /^author (.+?) <([^>]+)> (\d+) ([+-]\d+)$/.exec(line);
    if (m) {
      const [, name, email, ts, tz] = m;
      if (email !== NEW_EMAIL) {
        return `author ${NEW_NAME} <${NEW_EMAIL}> ${ts} ${tz}`;
      }
      return line;
    }
    m = /^committer (.+?) <([^>]+)> (\d+) ([+-]\d+)$/.exec(line);
    if (m) {
      const [, name, email, ts, tz] = m;
      if (email !== NEW_EMAIL) {
        return `committer ${NEW_NAME} <${NEW_EMAIL}> ${ts} ${tz}`;
      }
      return line;
    }
    return line;
  }

  require('stream').pipeline(readable, writable, cb).catch(cb);
}

function main() {
  const repoDir = path.resolve(__dirname, '..');
  process.chdir(repoDir);

  console.log('Repo:', repoDir);
  console.log(`Rewriting authors → "${NEW_NAME} <${NEW_EMAIL}>"\n`);

  // Count commits by current author before rewrite
  console.log('Before rewrite:');
  const before = git([
    'shortlog',
    '-sne',
    '--all',
    `${REF_TO_REWRITE}`,
  ]);
  console.log(before);
  console.log('---');

  // Export current refs (we only need main)
  console.log('Exporting...');
  const exportRes = spawnSync('git', ['fast-export', REF_TO_REWRITE], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (exportRes.status !== 0) {
    console.error('git fast-export failed');
    console.error(exportRes.stderr);
    process.exit(1);
  }
  const exportData = exportRes.stdout;

  // Replace authors
  console.log('Rewriting authors in stream...');
  const rewritten = [];
  for (const line of exportData.split('\n')) {
    let m = /^author (.+?) <([^>]+)> (\d+) ([+-]\d+)$/.exec(line);
    if (m) {
      const [, , email, ts, tz] = m;
      if (email !== NEW_EMAIL) {
        rewritten.push(`author ${NEW_NAME} <${NEW_EMAIL}> ${ts} ${tz}`);
        continue;
      }
    }
    m = /^committer (.+?) <([^>]+)> (\d+) ([+-]\d+)$/.exec(line);
    if (m) {
      const [, , email, ts, tz] = m;
      if (email !== NEW_EMAIL) {
        rewritten.push(`committer ${NEW_NAME} <${NEW_EMAIL}> ${ts} ${tz}`);
        continue;
      }
    }
    rewritten.push(line);
  }
  const rewrittenData = rewritten.join('\n');

  // Backup current reflog tip for safety
  const oldTip = git(['rev-parse', REF_TO_REWRITE]).trim();
  console.log(`Old tip: ${oldTip}`);

  // Reset to empty state for fast-import
  console.log('Resetting branch...');
  // Clear ref to be rewritten by deleting it temporarily
  // Use update-ref + empty tree approach: easier to just delete and recreate
  git(['update-ref', '-d', REF_TO_REWRITE]);

  // Import rewritten stream
  console.log('Importing rewritten stream...');
  const importRes = spawnSync('git', ['fast-import', '--quiet'], {
    input: rewrittenData,
    encoding: 'utf8',
  });
  if (importRes.status !== 0) {
    console.error('git fast-import failed');
    console.error(importRes.stderr);
    process.exit(1);
  }

  // Verify
  console.log('\nAfter rewrite:');
  const after = git(['shortlog', '-sne', '--all', REF_TO_REWRITE]);
  console.log(after);

  const newTip = git(['rev-parse', REF_TO_REWRITE]).trim();
  console.log(`\nNew tip: ${newTip}`);
  console.log(`Tip changed: ${oldTip !== newTip ? 'YES (history rewritten)' : 'NO'}`);

  // Reflog for recovery
  console.log('\nReflog (last 5):');
  console.log(git(['reflog', '-n', '5']));
  console.log('\nDone. Run: git push --force-with-lease origin main');
}

main();
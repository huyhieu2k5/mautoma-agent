import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findRepoRoot(start: string): string {
  let cur = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(cur, 'package.json'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`Cannot find repo root (package.json) from ${start}`);
}

const REPO_ROOT = findRepoRoot(__dirname);
const SCRIPT = path.resolve(REPO_ROOT, 'scripts', 'validate-plugin-manifest.mts');

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-manifest-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function runWithEnv(): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    process.execPath,
    [path.resolve(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), SCRIPT],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    }
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

describe('validate-plugin-manifest.mts (against the real repo)', () => {
  it('validates the bundled manifests and exits 0', () => {
    const result = runWithEnv();
    expect(result.stdout).toContain('Cursor plugin manifest');
    expect(result.stdout).toContain('App manifest');
    expect(result.stdout).toContain('Result: PASS');
    expect(result.status).toBe(0);
  });
});
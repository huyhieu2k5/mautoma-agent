import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'router-cli-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const CLI_PATH = path.resolve(__dirname, 'capability-router-cli.ts');
const RUN_CLI = (
  args: string[]
): { stdout: string; stderr: string; status: number } => {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      CLI_PATH,
      ...args,
    ],
    {
      cwd: tmpRoot,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    }
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
};

describe('capability-router-cli', () => {
  it('--help exits 0 and prints usage', () => {
    const result = RUN_CLI(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('USAGE');
    expect(result.stdout).toContain('--raw');
    expect(result.stdout).toContain('--json');
  });

  it('missing --raw exits 1 with error message', () => {
    const result = RUN_CLI([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--raw/);
  });

  it('--raw "<text>" exits 0 and prints a decision in text mode', () => {
    const result = RUN_CLI(['--raw', 'Refactor code của tôi']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Primary axis');
    expect(result.stdout).toContain('Score');
    expect(result.stdout).toContain('Champion agent');
  });

  it('--raw with --json emits valid JSON containing the expected shape', () => {
    const result = RUN_CLI(['--raw', 'Test request', '--json']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('primary');
    expect(parsed).toHaveProperty('score');
    expect(parsed).toHaveProperty('axes');
    expect(parsed).toHaveProperty('championId');
    expect(Array.isArray(parsed.axes)).toBe(true);
  });

  it('positional "<text>" is accepted (no --raw needed)', () => {
    const result = RUN_CLI(['positional request text']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('positional request text');
  });

  it('--language en is accepted', () => {
    const result = RUN_CLI(['--raw', 'Test', '--language', 'en', '--json']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.primary).toBeDefined();
  });

  it('--language xx (invalid) exits 1', () => {
    const result = RUN_CLI(['--raw', 'Test', '--language', 'xx']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--language must be vi\|en/);
  });

  it('--confidence 0.5 is accepted', () => {
    const result = RUN_CLI(['--raw', 'Test', '--confidence', '0.5', '--json']);
    expect(result.status).toBe(0);
  });

  it('--confidence 2.0 (out of range) exits 1', () => {
    const result = RUN_CLI(['--raw', 'Test', '--confidence', '2.0']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--confidence must be 0\.\.1/);
  });

  it('--skip-dispute combined with --json returns championId=null', () => {
    const result = RUN_CLI(['--raw', 'Test', '--skip-dispute', '--json']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.championId).toBeNull();
  });

  it('--unknown-flag exits 1', () => {
    const result = RUN_CLI(['--raw', 'Test', '--bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown flag/);
  });

  it('--raw with whitespace-only text exits 1', () => {
    const result = RUN_CLI(['--raw', '   ']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--raw/);
  });
});
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aicleaner-cli-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const CLI_PATH = path.resolve(__dirname, 'cli.ts');
const RUN_CLI = (args: string[]): { stdout: string; stderr: string; status: number } => {
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

describe('file-cleaner/cli', () => {
  it('--dry-run does not delete files and does not create AI_NOTES.md', () => {
    fs.writeFileSync(path.join(tmpRoot, 'draft.md'), 'a'.repeat(100));
    const result = RUN_CLI(['--dry-run']);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tmpRoot, 'draft.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'AI_NOTES.md'))).toBe(false);
    expect(result.stdout).toContain('AI File Cleaner');
    expect(result.stdout).toMatch(/Scanned:\s+\d+/);
  });

  it('without --dry-run deletes matching files', () => {
    fs.writeFileSync(path.join(tmpRoot, 'plan.md'), 'x'.repeat(100));
    const result = RUN_CLI([]);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tmpRoot, 'plan.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'AI_NOTES.md'))).toBe(true);
  });

  it('--remove-note=<keyword> removes a section from AI_NOTES.md and exits 0', () => {
    fs.writeFileSync(path.join(tmpRoot, 'AI_NOTES.md'), '# AI Notes\n\n## Merged: foo.md\nbody\n');
    const result = RUN_CLI(['--remove-note=foo.md']);
    expect(result.status).toBe(0);
    const after = fs.readFileSync(path.join(tmpRoot, 'AI_NOTES.md'), 'utf8');
    expect(after).not.toContain('foo.md');
    expect(result.stdout).toMatch(/Removed section matching "foo.md"/);
  });

  it('--remove-note=<keyword> returns skip message when no match', () => {
    fs.writeFileSync(path.join(tmpRoot, 'AI_NOTES.md'), '# AI Notes\n');
    const result = RUN_CLI(['--remove-note=never-there']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/No section matched "never-there"/);
  });

  it('--scan=dir1,dir2 restricts scanning to those subdirs', () => {
    fs.mkdirSync(path.join(tmpRoot, 'sub1'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'sub2'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'sub1', 'draft.md'), 'a'.repeat(100));
    fs.writeFileSync(path.join(tmpRoot, 'sub2', 'plan.md'), 'b'.repeat(100));
    fs.writeFileSync(path.join(tmpRoot, 'sub1', 'plan.md'), 'c'.repeat(100));

    const result = RUN_CLI(['--dry-run', '--scan=sub1']);
    expect(result.status).toBe(0);
    // sub1 scanned: both draft.md and plan.md flagged (2)
    // sub2 NOT scanned: plan.md should remain
    expect(result.stdout).toMatch(/Flagged:\s+2/);
    expect(fs.existsSync(path.join(tmpRoot, 'sub2', 'plan.md'))).toBe(true);
  });

  it('--quiet suppresses per-item details', () => {
    fs.writeFileSync(path.join(tmpRoot, 'draft.md'), 'a'.repeat(100));
    const result = RUN_CLI(['--dry-run', '--quiet']);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('Details:');
  });

  it('exits 0 even with no candidates to clean', () => {
    const result = RUN_CLI(['--dry-run']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Scanned:\s+\d+/);
  });
});
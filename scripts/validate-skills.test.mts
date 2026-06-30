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
const SCRIPT = path.resolve(REPO_ROOT, 'scripts', 'validate-skills.mts');

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-skills-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function runFrom(cwd: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    process.execPath,
    [path.resolve(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), SCRIPT],
    {
      cwd,
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

describe('validate-skills.mts', () => {
  it('exits 0 when all SKILL.md files have valid frontmatter (real repo)', () => {
    const result = runFrom(REPO_ROOT);
    expect(result.stdout).toMatch(/validated — all frontmatter OK/);
    expect(result.status).toBe(0);
  });

  it('exits 0 for a valid skill', () => {
    const skillsDir = path.join(REPO_ROOT, 'skills', 'good-skill');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'SKILL.md'),
      '---\nname: good-skill\ndescription: "A well-formed description for testing."\n---\n# Body\n'
    );
    try {
      const result = runFrom(REPO_ROOT);
      // The repo's other 46 skills are all valid, so total is now 47 and result is PASS
      expect(result.stdout).toMatch(/47 skill\(s\) validated/);
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(skillsDir, { recursive: true, force: true });
    }
  });

  it('exits 1 when a skill is missing SKILL.md', () => {
    const brokenDir = path.join(REPO_ROOT, 'skills', 'temp-broken-for-test');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, 'README.md'), 'no SKILL.md');
    try {
      const result = runFrom(REPO_ROOT);
      expect(result.status).toBe(1);
      // CLI writes failures to stderr
      expect(result.stderr).toContain('temp-broken-for-test');
      expect(result.stderr).toContain('missing SKILL.md');
    } finally {
      fs.rmSync(brokenDir, { recursive: true, force: true });
    }
  });

  it('exits 1 when frontmatter name does not match folder', () => {
    const brokenDir = path.join(REPO_ROOT, 'skills', 'temp-name-mismatch');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(brokenDir, 'SKILL.md'),
      '---\nname: wrong-name\ndescription: "Some description here for testing"\n---\n# Body\n'
    );
    try {
      const result = runFrom(REPO_ROOT);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/name "wrong-name" does not match folder "temp-name-mismatch"/);
    } finally {
      fs.rmSync(brokenDir, { recursive: true, force: true });
    }
  });

  it('exits 1 when description is too short', () => {
    const brokenDir = path.join(REPO_ROOT, 'skills', 'temp-short-desc');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(brokenDir, 'SKILL.md'),
      '---\nname: temp-short-desc\ndescription: "short"\n---\n# Body\n'
    );
    try {
      const result = runFrom(REPO_ROOT);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/description is too short/);
    } finally {
      fs.rmSync(brokenDir, { recursive: true, force: true });
    }
  });
});
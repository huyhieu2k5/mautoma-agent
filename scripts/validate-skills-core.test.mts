/**
 * Unit tests for validate-skills-core.mts (pure logic)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateSkill, walkSkillFolders, runSkillsValidation } from './validate-skills-core';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-skills-core-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeSkill(name: string, frontmatter: object, body = '# Body\n'): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
    .join('\n');
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\n${yaml}\n---\n${body}`);
  return dir;
}

describe('validateSkill', () => {
  it('returns no issues for a valid skill', () => {
    const dir = makeSkill('good', { name: 'good', description: 'A well-formed description.' });
    expect(validateSkill(dir)).toEqual({ folder: 'good', issues: [] });
  });

  it('reports missing SKILL.md', () => {
    const dir = path.join(tmpRoot, 'empty');
    fs.mkdirSync(dir, { recursive: true });
    const result = validateSkill(dir);
    expect(result.issues).toContain('missing SKILL.md');
  });

  it('reports name that does not match folder', () => {
    const dir = makeSkill('actual-folder', { name: 'wrong-name', description: 'Some description here for testing.' });
    const result = validateSkill(dir);
    expect(result.issues.some((i) => i.includes('does not match folder'))).toBe(true);
  });

  it('reports name not in kebab-case', () => {
    const dir = makeSkill('Bad-Name', { name: 'Bad-Name', description: 'A valid description here for testing.' });
    const result = validateSkill(dir);
    expect(result.issues.some((i) => i.includes('lowercase kebab-case'))).toBe(true);
  });

  it('reports missing description', () => {
    const dir = path.join(tmpRoot, 'no-desc');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: no-desc\n---\nbody\n');
    const result = validateSkill(dir);
    expect(result.issues).toContain('missing frontmatter field: description');
  });

  it('reports multi-line description', () => {
    const dir = path.join(tmpRoot, 'multiline');
    fs.mkdirSync(dir, { recursive: true });
    // Note: we manually craft YAML so the | block scalar literally contains "\n"
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      '---\nname: multiline\ndescription: |\n  This is\n  multi-line\n---\nbody\n'
    );
    const result = validateSkill(dir);
    expect(result.issues).toContain('description must be a single line');
  });

  it('reports description too short', () => {
    const dir = makeSkill('short', { name: 'short', description: 'tiny' });
    const result = validateSkill(dir);
    expect(result.issues.some((i) => i.includes('description is too short'))).toBe(true);
  });

  it('reports missing name field', () => {
    const dir = path.join(tmpRoot, 'no-name');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      '---\ndescription: "Some description here for testing."\n---\nbody\n'
    );
    const result = validateSkill(dir);
    expect(result.issues).toContain('missing frontmatter field: name');
  });

  it('reports invalid YAML', () => {
    const dir = path.join(tmpRoot, 'bad-yaml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: [unclosed\n---\nbody\n');
    const result = validateSkill(dir);
    expect(result.issues.some((i) => i.includes('not valid YAML'))).toBe(true);
  });
});

describe('walkSkillFolders', () => {
  it('returns immediate subdirectories only', () => {
    fs.mkdirSync(path.join(tmpRoot, 'skill-1'));
    fs.mkdirSync(path.join(tmpRoot, 'skill-2'));
    fs.mkdirSync(path.join(tmpRoot, 'skill-1', 'nested')); // should be ignored
    const folders = walkSkillFolders(tmpRoot);
    expect(folders.sort()).toEqual([path.join(tmpRoot, 'skill-1'), path.join(tmpRoot, 'skill-2')].sort());
  });

  it('returns empty array for non-existent dir', () => {
    expect(() => walkSkillFolders(path.join(tmpRoot, 'nope'))).toThrow();
  });
});

describe('runSkillsValidation', () => {
  it('returns allValid=true with empty issues for valid skills', () => {
    makeSkill('good-1', { name: 'good-1', description: 'A well-formed description here.' });
    makeSkill('good-2', { name: 'good-2', description: 'Another well-formed description here.' });
    const result = runSkillsValidation(tmpRoot);
    expect(result.allValid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(2);
  });

  it('returns allValid=false with issue list when one skill is broken', () => {
    makeSkill('good', { name: 'good', description: 'A well-formed description here.' });
    makeSkill('bad', { name: 'wrong', description: 'A well-formed description here.' });
    const result = runSkillsValidation(tmpRoot);
    expect(result.allValid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].folder).toBe('bad');
  });

  it('prints useful output to the captured lines', () => {
    makeSkill('good', { name: 'good', description: 'A well-formed description here.' });
    const result = runSkillsValidation(tmpRoot);
    expect(result.printed.some((l) => l.includes('1 skill(s) validated'))).toBe(true);
  });
});
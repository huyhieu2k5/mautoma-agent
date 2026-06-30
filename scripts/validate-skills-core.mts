/**
 * validate-skills-core.mts — pure logic for SKILL.md frontmatter validation.
 * No I/O at the top level; everything is exported.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import matter from 'gray-matter';

export interface SkillIssue {
  folder: string;
  issues: string[];
}

export function walkSkillFolders(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(full);
    }
  }
  return out;
}

export function validateSkill(
  skillFolder: string,
  readFn: (path: string) => string = readFileSync as unknown as (path: string) => string
): SkillIssue {
  const issues: string[] = [];
  const folderName = basename(skillFolder);
  const skillMd = resolve(skillFolder, 'SKILL.md');

  let raw: string;
  try {
    raw = readFn(skillMd);
  } catch {
    issues.push('missing SKILL.md');
    return { folder: folderName, issues };
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push(`SKILL.md frontmatter is not valid YAML: ${msg}`);
    return { folder: folderName, issues };
  }

  const data = parsed.data as { name?: unknown; description?: unknown };

  if (!data.name) {
    issues.push('missing frontmatter field: name');
  } else if (typeof data.name !== 'string') {
    issues.push(`name must be a string (got ${typeof data.name})`);
  } else if (data.name !== folderName) {
    issues.push(`name "${data.name}" does not match folder "${folderName}"`);
  } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(data.name)) {
    issues.push(`name "${data.name}" is not lowercase kebab-case`);
  }

  if (!data.description) {
    issues.push('missing frontmatter field: description');
  } else if (typeof data.description !== 'string') {
    issues.push('description must be a string');
  } else if (data.description.includes('\n')) {
    issues.push('description must be a single line');
  } else if (data.description.trim().length < 10) {
    issues.push('description is too short (< 10 chars)');
  }

  return { folder: folderName, issues };
}

export interface RunSkillsResult {
  total: number;
  issues: SkillIssue[];
  printed: string[];
  allValid: boolean;
}

export function runSkillsValidation(
  skillsDir: string,
  walkFn: (dir: string) => string[] = walkSkillFolders,
  validateFn: (folder: string) => SkillIssue = (f) => validateSkill(f)
): RunSkillsResult {
  const printed: string[] = [];
  const folders = walkFn(skillsDir);
  const issues: SkillIssue[] = [];

  for (const folder of folders) {
    const result = validateFn(folder);
    if (result.issues.length > 0) {
      issues.push(result);
    }
  }

  if (issues.length === 0) {
    const line = `[ok] ${folders.length} skill(s) validated — all frontmatter OK`;
    console.log(line);
    printed.push(line);
  } else {
    const line = `[FAIL] ${issues.length} skill(s) have issues:\n`;
    console.error(line);
    printed.push(line);
    for (const { folder, issues: skillIssues } of issues) {
      const folderLine = `  ${folder}/`;
      console.error(folderLine);
      printed.push(folderLine);
      for (const issue of skillIssues) {
        const issueLine = `    - ${issue}`;
        console.error(issueLine);
        printed.push(issueLine);
      }
    }
    const summary = `\n${folders.length - issues.length}/${folders.length} skills are valid`;
    console.error(summary);
    printed.push(summary);
  }

  return {
    total: folders.length,
    issues,
    printed,
    allValid: issues.length === 0,
  };
}
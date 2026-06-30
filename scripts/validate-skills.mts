#!/usr/bin/env node
/**
 * validate-skills.mts — CLI entry point for SKILL.md frontmatter validation.
 * Pure logic lives in `./validate-skills-core.mts` for testability.
 */

import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSkillsValidation } from './validate-skills-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const skillsDir = resolve(repoRoot, 'skills');

function main(): void {
  console.log(`Scanning ${relative(repoRoot, skillsDir)}/ for SKILL.md frontmatter issues\n`);
  const { allValid } = runSkillsValidation(skillsDir);
  process.exit(allValid ? 0 : 1);
}

main();
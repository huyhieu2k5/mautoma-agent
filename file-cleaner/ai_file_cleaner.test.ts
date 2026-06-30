import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AIFileCleaner, AI_NOTES_FILENAME, cleanupAIArtifacts, removeNote } from './ai_file_cleaner';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aicleaner-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): string {
  const full = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

describe('AIFileCleaner', () => {
  it('skips the AI_NOTES.md file itself (protected)', async () => {
    const notesPath = writeFile(AI_NOTES_FILENAME, '# AI Notes\n');
    const cleaner = new AIFileCleaner({ rootDir: tmpRoot, dryRun: true });
    const report = await cleaner.run();
    expect(fs.existsSync(notesPath)).toBe(true);
    expect(report.details.find((d) => d.file === AI_NOTES_FILENAME)).toBeUndefined();
  });

  it('flags and merges files matching AI patterns (draft, scratch, plan, etc.)', async () => {
    writeFile('draft.md', 'a'.repeat(100));
    writeFile('plan.md', 'b'.repeat(100));
    writeFile('scratch.ts', 'c'.repeat(100));
    writeFile('test-foo.ts', 'd'.repeat(100));

    const cleaner = new AIFileCleaner({ rootDir: tmpRoot, dryRun: true });
    const report = await cleaner.run();

    expect(report.scanned).toBeGreaterThanOrEqual(4);
    expect(report.flagged).toBeGreaterThanOrEqual(4);
    expect(report.details.length).toBeGreaterThanOrEqual(4);
    const flaggedNames = report.details.map((d) => path.basename(d.file));
    expect(flaggedNames).toEqual(expect.arrayContaining(['draft.md', 'plan.md', 'scratch.ts', 'test-foo.ts']));
  });

  it('does NOT delete anything in dry-run mode', async () => {
    const draftPath = writeFile('draft.md', 'a'.repeat(100));
    const cleaner = new AIFileCleaner({ rootDir: tmpRoot, dryRun: true });
    const report = await cleaner.run();
    expect(report.deleted).toBe(0);
    expect(fs.existsSync(draftPath)).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, AI_NOTES_FILENAME))).toBe(false);
  });

  it('merges content into AI_NOTES.md and deletes source file when not dry-run', async () => {
    const draftPath = writeFile('draft.md', 'x'.repeat(120));
    const cleaner = new AIFileCleaner({ rootDir: tmpRoot, dryRun: false });
    const report = await cleaner.run();

    // merged_into_notes increments mergedIntoNotes, not deleted (deleted counter is for "empty" / "short" cases)
    expect(report.mergedIntoNotes).toBe(1);
    expect(report.flagged).toBe(1);
    expect(fs.existsSync(draftPath)).toBe(false);

    const notesPath = path.join(tmpRoot, AI_NOTES_FILENAME);
    expect(fs.existsSync(notesPath)).toBe(true);
    const notes = fs.readFileSync(notesPath, 'utf8');
    expect(notes).toContain('AI Notes');
    expect(notes).toContain('draft.md');
    expect(notes).toContain('x'.repeat(120));
  });

  it('deletes empty matching files without merging', async () => {
    const emptyDraft = writeFile('draft.md', '');
    const cleaner = new AIFileCleaner({ rootDir: tmpRoot, dryRun: false });
    const report = await cleaner.run();

    expect(report.deleted).toBe(1);
    expect(report.mergedIntoNotes).toBe(0);
    expect(fs.existsSync(emptyDraft)).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, AI_NOTES_FILENAME))).toBe(false);
  });

  it('does not touch protected files (package.json, README.md, etc.)', async () => {
    writeFile('package.json', '{}');
    writeFile('README.md', '# Hello');
    writeFile('CHANGELOG.md', '## v1');
    const cleaner = new AIFileCleaner({ rootDir: tmpRoot, dryRun: false });
    await cleaner.run();

    expect(fs.existsSync(path.join(tmpRoot, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'CHANGELOG.md'))).toBe(true);
  });

  it('does not touch hidden files except .gitignore and .env*', async () => {
    writeFile('.random-config', 'secret');
    writeFile('.gitignore', 'node_modules');
    const cleaner = new AIFileCleaner({ rootDir: tmpRoot, dryRun: false });
    await cleaner.run();

    expect(fs.existsSync(path.join(tmpRoot, '.random-config'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, '.gitignore'))).toBe(true);
  });

  it('skipPatterns can be overridden to be more or less strict', async () => {
    writeFile('my-custom.md', 'x'.repeat(100));
    const strict = new AIFileCleaner({
      rootDir: tmpRoot,
      dryRun: true,
      aiPatterns: [/^never-match-anything$/],
    });
    const report = await strict.run();
    expect(report.flagged).toBe(0);
  });
});

describe('AIFileCleaner.removeNoteSection', () => {
  it('returns false when AI_NOTES.md does not exist', () => {
    const cleaner = new AIFileCleaner({ rootDir: tmpRoot });
    expect(cleaner.removeNoteSection('foo')).toBe(false);
  });

  it('removes a matching section from AI_NOTES.md', async () => {
    writeFile('draft1.md', 'first content aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk');
    writeFile('draft2.md', 'second content aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk');

    const cleaner = new AIFileCleaner({ rootDir: tmpRoot });
    await cleaner.run();

    const notesPath = path.join(tmpRoot, AI_NOTES_FILENAME);
    expect(fs.existsSync(notesPath)).toBe(true);

    const ok = cleaner.removeNoteSection('draft1.md');
    expect(ok).toBe(true);
    const notes = fs.readFileSync(notesPath, 'utf8');
    expect(notes).not.toContain('draft1.md');
    expect(notes).toContain('draft2.md');
  });
});

describe('cleanupAIArtifacts helper', () => {
  it('runs the same engine', async () => {
    writeFile('draft.md', 'a'.repeat(100));
    const report = await cleanupAIArtifacts({ rootDir: tmpRoot });
    expect(report.mergedIntoNotes).toBe(1);
  });
});

describe('removeNote helper', () => {
  it('removes section from AI_NOTES.md', () => {
    const notesPath = writeFile(AI_NOTES_FILENAME, '# AI Notes\n\n## Merged: foo.md\nbody\n');
    expect(removeNote('foo.md', tmpRoot)).toBe(true);
    const after = fs.readFileSync(notesPath, 'utf8');
    expect(after).not.toContain('foo.md');
  });

  it('returns false when no section matches', () => {
    writeFile(AI_NOTES_FILENAME, '# AI Notes\n');
    expect(removeNote('never-there', tmpRoot)).toBe(false);
  });
});
/**
 * codegraph/analyzer.ts — Code structure analyzer (hard-limited, no subprocesses)
 *
 * Walks a directory tree (depth-bounded, file-capped) and produces CodeStructure.
 * Uses lightweight regex parser — NOT a full AST. Keeps RAM stable.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  AnalyzeOptions,
  CodeStructure,
  FileSummary,
  ModuleInfo,
} from './types';
import {
  detectLanguage,
  isTestFile,
  countFunctions,
  countClasses,
  countInterfaces,
  extractImports,
  extractExports,
} from './parser';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_FILE_SIZE = 200_000;  // 200KB
const DEFAULT_DEPTH = 2;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  'target', 'vendor', 'out', '.cache', '.turbo', '.vercel',
]);

/**
 * Walk directory with hard caps (depth, file count, file size)
 */
export function safeWalk(
  root: string,
  options: AnalyzeOptions
): string[] {
  const maxDepth = options.depth ?? DEFAULT_DEPTH;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const extensions = new Set(options.extensions ?? DEFAULT_EXTENSIONS);
  const includeTests = options.includeTests ?? false;

  const files: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (files.length >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;

      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!extensions.has(ext)) continue;
        if (!includeTests && isTestFile(entry.name)) continue;
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > maxFileSize) continue;
          files.push(fullPath);
        } catch {
          // ignore
        }
      }
    }
  }

  walk(root, 0);
  return files;
}

/**
 * Analyze a single file — extract structure
 */
export function analyzeFile(absPath: string, root: string): FileSummary {
  const content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split('\n').length;
  const bytes = Buffer.byteLength(content, 'utf8');

  return {
    path: absPath,
    relativePath: path.relative(root, absPath),
    lines,
    bytes,
    language: detectLanguage(absPath),
    functions: countFunctions(content),
    classes: countClasses(content),
    interfaces: countInterfaces(content),
    imports: extractImports(content),
    exports: extractExports(content),
  };
}

/**
 * Main analysis function — returns CodeStructure summary
 */
export function analyzeCode(root: string, options: AnalyzeOptions = {}): CodeStructure {
  const files = safeWalk(root, options);
  const summaries: FileSummary[] = [];

  let totalLines = 0;
  let totalFunctions = 0;
  let totalClasses = 0;
  let totalInterfaces = 0;
  const languages: Record<string, number> = {};
  const moduleMap = new Map<string, ModuleInfo>();

  for (const file of files) {
    try {
      const summary = analyzeFile(file, root);
      summaries.push(summary);

      totalLines += summary.lines;
      totalFunctions += summary.functions;
      totalClasses += summary.classes;
      totalInterfaces += summary.interfaces;

      languages[summary.language] = (languages[summary.language] ?? 0) + 1;

      // Group by top-level module
      const parts = summary.relativePath.split(/[\\/]/);
      const moduleName = parts[0] ?? 'root';
      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, {
          name: moduleName,
          path: parts.slice(0, 1).join('/'),
          fileCount: 0,
          totalLines: 0,
        });
      }
      const mod = moduleMap.get(moduleName)!;
      mod.fileCount++;
      mod.totalLines += summary.lines;
    } catch {
      // Skip unreadable files
    }
  }

  return {
    totalFiles: summaries.length,
    totalLines,
    moduleCount: moduleMap.size,
    functionCount: totalFunctions,
    classCount: totalClasses,
    interfaceCount: totalInterfaces,
    modules: Array.from(moduleMap.values()),
    files: summaries,
    languages,
  };
}
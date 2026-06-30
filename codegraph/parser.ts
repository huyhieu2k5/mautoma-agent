/**
 * codegraph/parser.ts — Lightweight TS/JS code parser (regex-based, no AST dep)
 *
 * Avoids TypeScript compiler API to keep memory/CPU low.
 * Extracts: function counts, class counts, imports, exports, line counts.
 * Hard limits: file size cap, depth cap, file count cap (defined in analyzer).
 */

import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  'target', 'vendor', 'out', '.cache', '.turbo', '.vercel',
]);

export function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
      return 'javascript';
    case '.jsx':
      return 'jsx';
    case '.mjs':
      return 'mjs';
    case '.cjs':
      return 'cjs';
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    case '.py':
      return 'python';
    default:
      return 'other';
  }
}

export function isTestFile(filename: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filename) || filename.includes('__tests__');
}

/**
 * Count functions via regex (approximate — catches function decls, arrow functions assigned to const)
 */
export function countFunctions(content: string): number {
  // function name(...) { ... }
  const decls = (content.match(/(?:export\s+)?(?:async\s+)?function\s+\w+/g) ?? []).length;
  // const name = (...) => { ... }
  const arrows = (content.match(/(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\()/g) ?? []).length;
  // class methods
  const methods = (content.match(/^\s+(?:public\s+|private\s+|protected\s+)?(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm) ?? []).length;
  return decls + arrows + methods;
}

/**
 * Count classes
 */
export function countClasses(content: string): number {
  return (content.match(/(?:export\s+)?(?:abstract\s+)?class\s+\w+/g) ?? []).length;
}

/**
 * Count interfaces / types
 */
export function countInterfaces(content: string): number {
  const interfaces = (content.match(/(?:export\s+)?interface\s+\w+/g) ?? []).length;
  const types = (content.match(/(?:export\s+)?type\s+\w+/g) ?? []).length;
  return interfaces + types;
}

/**
 * Extract import paths from file content
 */
export function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /(?:import|export)[^'"`;]*?(?:from\s*)?['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(content))) {
    imports.push(m[1]);
  }
  return imports;
}

/**
 * Extract export names from file content
 */
export function extractExports(content: string): string[] {
  const exports: string[] = [];
  const exportRegex = /export\s+(?:const|let|var|function|class|interface|type|async\s+function)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = exportRegex.exec(content))) {
    exports.push(m[1]);
  }
  // Also catch export { a, b, c }
  const namedExports = content.match(/export\s*\{([^}]+)\}/g) ?? [];
  for (const block of namedExports) {
    const names = block.match(/\b\w+\b/g);
    if (names) exports.push(...names.slice(1));  // skip 'export'
  }
  return Array.from(new Set(exports));
}

/**
 * Resolve import path to absolute file path (best-effort)
 */
export function resolveImport(fromFile: string, importPath: string, extensions: string[]): string | null {
  if (!importPath.startsWith('.')) return null;  // Skip bare module specifiers

  const dir = path.dirname(fromFile);
  const candidate = path.resolve(dir, importPath);

  // Direct file match
  if (fs.existsSync(candidate)) {
    const stats = fs.statSync(candidate);
    if (stats.isFile()) return candidate;
  }

  // Try with extensions
  for (const ext of extensions) {
    const withExt = candidate + ext;
    if (fs.existsSync(withExt)) return withExt;
  }

  // Try as directory with index
  for (const ext of extensions) {
    const indexPath = path.join(candidate, 'index' + ext);
    if (fs.existsSync(indexPath)) return indexPath;
  }

  return null;
}
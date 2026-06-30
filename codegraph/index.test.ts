import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createCodeGraphManager,
  analyzeCode,
  buildImportGraph,
  findCycles,
  findOrphans,
  mostDependedOn,
  mostOutbound,
  generateDependencyReport,
  detectLanguage,
  isTestFile,
  countFunctions,
  countClasses,
  countInterfaces,
  extractImports,
  extractExports,
  resolveImport,
  type CodeGraphManager,
  type CodeStructure,
} from './index';

let tmp: string;

function writeProject(): void {
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'cg-test' }));

  mkdirSync(join(tmp, 'src'), { recursive: true });
  writeFileSync(join(tmp, 'src', 'a.ts'), `
export function aFn(): number { return 1; }
export class AClass {}
export interface AIface {}
export const aConst = (x: number) => x * 2;
  `.trim());

  writeFileSync(join(tmp, 'src', 'b.ts'), `
import { aFn } from './a';
export function bFn(): number { return aFn() + 1; }
export class BClass {}
  `.trim());

  writeFileSync(join(tmp, 'src', 'c.ts'), `
import { aFn } from './a';
import { bFn } from './b';
export function cFn(): number { return aFn() + bFn(); }
  `.trim());

  // Circular: d ↔ e
  writeFileSync(join(tmp, 'src', 'd.ts'), `
import { eFn } from './e';
export function dFn(): number { return eFn() + 1; }
  `.trim());

  writeFileSync(join(tmp, 'src', 'e.ts'), `
import { dFn } from './d';
export function eFn(): number { return dFn() + 1; }
  `.trim());

  // Orphan
  writeFileSync(join(tmp, 'src', 'orphan.ts'), `
export function orphanFn(): void {}
  `.trim());
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cg-test-'));
  writeProject();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('codegraph — detectLanguage', () => {
  it('maps extensions to language names', () => {
    expect(detectLanguage('foo.ts')).toBe('typescript');
    expect(detectLanguage('foo.tsx')).toBe('tsx');
    expect(detectLanguage('foo.js')).toBe('javascript');
    expect(detectLanguage('foo.jsx')).toBe('jsx');
    expect(detectLanguage('foo.mjs')).toBe('mjs');
    expect(detectLanguage('foo.cjs')).toBe('cjs');
    expect(detectLanguage('foo.json')).toBe('json');
    expect(detectLanguage('foo.py')).toBe('python');
    expect(detectLanguage('foo.unknown')).toBe('other');
  });
});

describe('codegraph — isTestFile', () => {
  it('detects test/spec files', () => {
    expect(isTestFile('foo.test.ts')).toBe(true);
    expect(isTestFile('foo.spec.ts')).toBe(true);
    expect(isTestFile('foo.test.tsx')).toBe(true);
    expect(isTestFile('foo.ts')).toBe(false);
    expect(isTestFile('__tests__/foo.ts')).toBe(true);
  });
});

describe('codegraph — countFunctions', () => {
  it('counts function declarations', () => {
    const count = countFunctions('export function a() {}\nexport async function b() {}');
    expect(count).toBe(2);
  });

  it('counts arrow functions assigned to const', () => {
    const count = countFunctions('export const a = () => 1;\nexport const b = async () => 2;');
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('counts class methods', () => {
    const count = countFunctions(`
      class Foo {
        public bar() {}
        private baz() {}
      }
    `);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('returns 0 for empty content', () => {
    expect(countFunctions('')).toBe(0);
  });
});

describe('codegraph — countClasses', () => {
  it('counts class declarations', () => {
    const count = countClasses('export class A {}\nexport abstract class B {}');
    expect(count).toBe(2);
  });

  it('returns 0 when no classes', () => {
    expect(countClasses('const x = 1;')).toBe(0);
  });
});

describe('codegraph — countInterfaces', () => {
  it('counts interfaces and types', () => {
    const count = countInterfaces('export interface I {}\nexport type T = string;');
    expect(count).toBe(2);
  });
});

describe('codegraph — extractImports', () => {
  it('extracts import paths', () => {
    const imports = extractImports(`import x from './a';\nimport { y } from './b';\nexport * from './c';`);
    expect(imports).toContain('./a');
    expect(imports).toContain('./b');
    expect(imports).toContain('./c');
  });

  it('handles multi-line imports', () => {
    const imports = extractImports(`import {\n  a,\n  b,\n} from './x';`);
    expect(imports).toContain('./x');
  });
});

describe('codegraph — extractExports', () => {
  it('extracts named exports', () => {
    const exports = extractExports(`export const a = 1;\nexport function b() {}`);
    expect(exports).toContain('a');
    expect(exports).toContain('b');
  });

  it('extracts re-exports', () => {
    const exports = extractExports(`export { foo, bar };`);
    expect(exports).toContain('foo');
    expect(exports).toContain('bar');
  });
});

describe('codegraph — resolveImport', () => {
  it('resolves relative imports', () => {
    const resolved = resolveImport(join(tmp, 'src', 'b.ts'), './a', ['.ts']);
    expect(resolved).toBe(join(tmp, 'src', 'a.ts'));
  });

  it('returns null for bare module specifiers', () => {
    expect(resolveImport(join(tmp, 'src', 'b.ts'), 'react', ['.ts'])).toBeNull();
  });

  it('returns null for unresolvable paths', () => {
    expect(resolveImport(join(tmp, 'src', 'b.ts'), './nonexistent', ['.ts'])).toBeNull();
  });

  it('resolves directory imports', () => {
    mkdirSync(join(tmp, 'src', 'pkg'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'pkg', 'index.ts'), 'export const x = 1;');
    const resolved = resolveImport(join(tmp, 'src', 'b.ts'), './pkg', ['.ts']);
    expect(resolved).toBe(join(tmp, 'src', 'pkg', 'index.ts'));
  });
});

describe('codegraph — analyzeCode', () => {
  it('analyzes all files in directory', () => {
    const structure = analyzeCode(tmp, { depth: 2 });
    expect(structure.totalFiles).toBeGreaterThan(0);
    expect(structure.totalLines).toBeGreaterThan(0);
  });

  it('reports module breakdown', () => {
    const structure = analyzeCode(tmp, { depth: 2 });
    expect(structure.moduleCount).toBeGreaterThan(0);
    expect(structure.modules.length).toBeGreaterThan(0);
  });

  it('counts functions, classes, interfaces', () => {
    const structure = analyzeCode(tmp, { depth: 2 });
    expect(structure.functionCount).toBeGreaterThan(0);
    expect(structure.classCount).toBeGreaterThan(0);
    expect(structure.interfaceCount).toBeGreaterThan(0);
  });

  it('reports language breakdown', () => {
    const structure = analyzeCode(tmp, { depth: 2 });
    expect(structure.languages.typescript).toBeGreaterThan(0);
  });

  it('respects includeTests option', () => {
    writeFileSync(join(tmp, 'src', 'foo.test.ts'), 'export function testFn() {}');
    const withoutTests = analyzeCode(tmp, { depth: 2, includeTests: false });
    const withTests = analyzeCode(tmp, { depth: 2, includeTests: true });
    expect(withTests.totalFiles).toBeGreaterThan(withoutTests.totalFiles);
  });

  it('respects depth limit', () => {
    mkdirSync(join(tmp, 'deep', 'deeper', 'deepest'), { recursive: true });
    writeFileSync(join(tmp, 'deep', 'deeper', 'deepest', 'x.ts'), 'export const x = 1;');
    const shallow = analyzeCode(tmp, { depth: 1 });
    const deep = analyzeCode(tmp, { depth: 5 });
    expect(deep.totalFiles).toBeGreaterThan(shallow.totalFiles);
  });

  it('respects maxFiles limit', () => {
    const structure = analyzeCode(tmp, { depth: 2, maxFiles: 3 });
    expect(structure.totalFiles).toBeLessThanOrEqual(3);
  });
});

describe('codegraph — buildImportGraph', () => {
  it('builds graph with nodes and edges', () => {
    const graph = buildImportGraph(tmp, { depth: 2 });
    expect(graph.nodes.size).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('edges have resolved paths', () => {
    const graph = buildImportGraph(tmp, { depth: 2 });
    const resolved = graph.edges.filter((e) => e.resolvedTo);
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe('codegraph — findCycles', () => {
  it('detects cycles in import graph', () => {
    const graph = buildImportGraph(tmp, { depth: 2 });
    const cycles = findCycles(graph);
    const hasDCycle = cycles.some((c) =>
      c.path.some((p) => p.endsWith('d.ts')) && c.path.some((p2) => p2.endsWith('e.ts'))
    );
    expect(hasDCycle).toBe(true);
  });

  it('returns empty array for acyclic graph', () => {
    // Create acyclic graph
    const t2 = mkdtempSync(join(tmpdir(), 'acyclic-'));
    try {
      writeFileSync(join(t2, 'package.json'), '{}');
      mkdirSync(join(t2, 'src'), { recursive: true });
      writeFileSync(join(t2, 'src', 'a.ts'), 'export const a = 1;');
      writeFileSync(join(t2, 'src', 'b.ts'), `import { a } from './a';\nexport const b = a + 1;`);
      const graph = buildImportGraph(t2, { depth: 2 });
      const cycles = findCycles(graph);
      expect(cycles).toHaveLength(0);
    } finally {
      rmSync(t2, { recursive: true, force: true });
    }
  });
});

describe('codegraph — findOrphans', () => {
  it('finds files with no imports and no inbound', () => {
    const graph = buildImportGraph(tmp, { depth: 2 });
    const orphans = findOrphans(graph);
    const hasOrphan = orphans.some((o) => o.endsWith('orphan.ts'));
    expect(hasOrphan).toBe(true);
  });
});

describe('codegraph — mostDependedOn / mostOutbound', () => {
  it('reports top inbound files', () => {
    const graph = buildImportGraph(tmp, { depth: 2 });
    const top = mostDependedOn(graph, 5);
    expect(top.length).toBeGreaterThan(0);
    expect(top[0]?.inbound).toBeGreaterThan(0);
  });

  it('reports top outbound files', () => {
    const graph = buildImportGraph(tmp, { depth: 2 });
    const top = mostOutbound(graph, 5);
    expect(top.length).toBeGreaterThan(0);
  });
});

describe('codegraph — generateDependencyReport', () => {
  it('returns full report', () => {
    const graph = buildImportGraph(tmp, { depth: 2 });
    const report = generateDependencyReport(graph);
    expect(report).toHaveProperty('mostDependedOn');
    expect(report).toHaveProperty('mostOutbound');
    expect(report).toHaveProperty('cycles');
    expect(report).toHaveProperty('orphans');
    expect(report.cycles.length).toBeGreaterThan(0);
    expect(report.orphans.length).toBeGreaterThan(0);
  });
});

describe('codegraph — CodeGraphManager', () => {
  let manager: CodeGraphManager;

  beforeEach(() => {
    manager = createCodeGraphManager();
  });

  it('analyze returns CodeStructure', () => {
    const structure = manager.analyze(tmp, { depth: 2 });
    expect(structure).toHaveProperty('totalFiles');
    expect(structure).toHaveProperty('modules');
  });

  it('getStats returns last analysis result', () => {
    manager.analyze(tmp, { depth: 2 });
    const stats = manager.getStats();
    expect(stats.totalFiles).toBeGreaterThan(0);
  });

  it('reset clears state', () => {
    manager.analyze(tmp, { depth: 2 });
    manager.reset();
    const stats = manager.getStats();
    expect(stats.totalFiles).toBeUndefined();
  });

  it('buildImportGraph delegates to function', () => {
    const graph = manager.buildImportGraph(tmp, { depth: 2 });
    expect(graph.nodes.size).toBeGreaterThan(0);
  });

  it('findCycles delegates to detector', () => {
    const graph = manager.buildImportGraph(tmp, { depth: 2 });
    const cycles = manager.findCycles(graph);
    expect(Array.isArray(cycles)).toBe(true);
  });
});
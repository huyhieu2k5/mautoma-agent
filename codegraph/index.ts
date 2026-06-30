/**
 * codegraph/index.ts — Public API surface.
 *
 * Exports:
 *  - createCodeGraphManager() → main entry
 *  - analyzeCode() → CodeStructure
 *  - buildImportGraph() → ImportGraph
 *  - findCycles() → GraphCycle[]
 *  - findOrphans() / mostDependedOn() / mostOutbound() → analysis helpers
 */

import type {
  CodeStructure,
  CodeGraphManager,
  AnalyzeOptions,
  ImportGraph,
  ImportEdge,
  GraphCycle,
  DependencyReport,
  FileSummary,
} from './types';
import { analyzeCode, safeWalk, analyzeFile } from './analyzer';
import { resolveImport } from './parser';
import {
  findCycles as detectCycles,
  findOrphans,
  mostDependedOn,
  mostOutbound,
} from './cycle_detector';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Build the import graph for a directory
 */
export function buildImportGraph(root: string, options: AnalyzeOptions = {}): ImportGraph {
  const files = safeWalk(root, options);
  const nodes = new Map<string, FileSummary>();
  const edges: ImportEdge[] = [];
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;

  for (const file of files) {
    try {
      const summary = analyzeFile(file, root);
      nodes.set(file, summary);

      for (const importPath of summary.imports) {
        const typeOnly = /^\s*import\s+type\s/.test('');  // crude; refined below
        const resolved = resolveImport(file, importPath, extensions);
        edges.push({
          from: file,
          to: importPath,
          resolvedTo: resolved ?? undefined,
          typeOnly,
        });
      }
    } catch {
      // skip
    }
  }

  return { nodes, edges };
}

/**
 * Generate a full dependency report
 */
export function generateDependencyReport(graph: ImportGraph): DependencyReport {
  return {
    mostDependedOn: mostDependedOn(graph),
    mostOutbound: mostOutbound(graph),
    cycles: detectCycles(graph),
    orphans: findOrphans(graph),
  };
}

/**
 * Default CodeGraphManager implementation
 */
export class DefaultCodeGraphManager implements CodeGraphManager {
  private lastStructure: CodeStructure | null = null;

  analyze(root: string, options?: AnalyzeOptions): CodeStructure {
    this.lastStructure = analyzeCode(root, options);
    return this.lastStructure;
  }

  buildImportGraph(root: string, options?: AnalyzeOptions): ImportGraph {
    return buildImportGraph(root, options);
  }

  findCycles(graph: ImportGraph): GraphCycle[] {
    return detectCycles(graph);
  }

  getStats(): { totalFiles?: number } {
    return { totalFiles: this.lastStructure?.totalFiles };
  }

  reset(): void {
    this.lastStructure = null;
  }
}

/**
 * Factory — create a fresh CodeGraphManager
 */
export function createCodeGraphManager(): CodeGraphManager {
  return new DefaultCodeGraphManager();
}

// Re-exports
export { analyzeCode, safeWalk, analyzeFile } from './analyzer';
export { findCycles, findOrphans, mostDependedOn, mostOutbound } from './cycle_detector';
export {
  detectLanguage,
  isTestFile,
  countFunctions,
  countClasses,
  countInterfaces,
  extractImports,
  extractExports,
  resolveImport,
} from './parser';

export type {
  CodeStructure,
  CodeGraphManager,
  AnalyzeOptions,
  ImportGraph,
  ImportEdge,
  GraphCycle,
  DependencyReport,
  FileSummary,
  ModuleInfo,
} from './types';
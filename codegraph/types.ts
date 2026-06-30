/**
 * codegraph/types.ts — Shared types for codegraph
 */

export interface CodeStructure {
  totalFiles: number;
  totalLines: number;
  moduleCount: number;
  functionCount: number;
  classCount: number;
  interfaceCount: number;
  /** Top-level directories (modules) */
  modules: ModuleInfo[];
  /** Per-file summaries */
  files: FileSummary[];
  /** Per-language breakdown */
  languages: Record<string, number>;
}

export interface ModuleInfo {
  name: string;
  path: string;
  fileCount: number;
  totalLines: number;
}

export interface FileSummary {
  path: string;
  relativePath: string;
  lines: number;
  bytes: number;
  language: string;
  functions: number;
  classes: number;
  interfaces: number;
  imports: string[];
  exports: string[];
}

export interface ImportEdge {
  from: string;
  to: string;
  /** Resolved absolute path (best-effort) */
  resolvedTo?: string;
  /** True if this is a type-only import */
  typeOnly: boolean;
}

export interface ImportGraph {
  nodes: Map<string, FileSummary>;
  edges: ImportEdge[];
}

export interface GraphCycle {
  /** File paths in the cycle, in order */
  path: string[];
  /** Length of the cycle */
  length: number;
}

export interface DependencyReport {
  /** Files with the most incoming imports (heavily depended on) */
  mostDependedOn: Array<{ file: string; inbound: number }>;
  /** Files with the most outgoing imports (heavy users) */
  mostOutbound: Array<{ file: string; outbound: number }>;
  /** Cycles detected */
  cycles: GraphCycle[];
  /** Orphan files (no imports, no inbound imports) */
  orphans: string[];
}

export interface AnalyzeOptions {
  /** Maximum directory depth (default: 2) */
  depth?: number;
  /** Include test files (*.test.ts, *.spec.ts) (default: false) */
  includeTests?: boolean;
  /** Specific file extensions to include (default: .ts, .js, .tsx, .jsx, .mjs, .cjs) */
  extensions?: string[];
  /** Maximum files to analyze (default: 200) */
  maxFiles?: number;
  /** Maximum file size to read (default: 200KB) */
  maxFileSize?: number;
}

export interface CodeGraphManager {
  analyze(root: string, options?: AnalyzeOptions): CodeStructure;
  buildImportGraph(root: string, options?: AnalyzeOptions): ImportGraph;
  findCycles(graph: ImportGraph): GraphCycle[];
  getStats(): { totalFiles?: number };
  reset(): void;
}
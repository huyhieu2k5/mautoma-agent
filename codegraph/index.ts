/**
 * codegraph — Lightweight stub for local type-check.
 */

export interface CodeStructure {
  totalFiles: number;
  moduleCount: number;
}

export interface CodeGraphManager {
  analyze(root: string, options?: { depth?: number; includeTests?: boolean }): CodeStructure;
  getStats(): { totalFiles?: number };
}

export function createCodeGraphManager(): CodeGraphManager {
  return {
    analyze(_root: string, _options?: { depth?: number; includeTests?: boolean }): CodeStructure {
      return { totalFiles: 0, moduleCount: 0 };
    },
    getStats(): { totalFiles?: number } {
      return { totalFiles: 0 };
    },
  };
}

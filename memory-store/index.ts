/**
 * memory-store — Lightweight stub for local type-check.
 */

export interface MemoryEntry {
  id: string;
  content: string;
}

export interface MemoryManager {
  getRecent(n: number): Promise<MemoryEntry[]>;
  getRelevantContext?(kind: string, n: number): MemoryEntry[];
}

export function getMemoryManager(): MemoryManager {
  return {
    async getRecent(_n: number): Promise<MemoryEntry[]> {
      return [];
    },
    getRelevantContext(_kind: string, _n: number): MemoryEntry[] {
      return [];
    },
  };
}

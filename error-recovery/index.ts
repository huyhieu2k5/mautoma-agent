/**
 * error-recovery — Lightweight stub for local type-check.
 */

export interface ErrorLearner {
  getErrorPatterns(): Promise<Array<{ id: string; signature: string }>>;
}

export function createErrorLearner(): ErrorLearner {
  return {
    async getErrorPatterns(): Promise<Array<{ id: string; signature: string }>> {
      return [];
    },
  };
}

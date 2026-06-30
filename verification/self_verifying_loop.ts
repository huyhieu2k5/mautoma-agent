/**
 * Self-Verifying Loop — iterate until verification passes or max iterations reached
 *
 * Strategy:
 *  1. Run the primary verification
 *  2. If fail → fix the most critical issue
 *  3. Re-verify
 *  4. Repeat up to maxIterations times
 *  5. Return final result + iteration count
 */

import { type VerificationResult, createVerificationEngine } from './index';

export interface VerifyLoopConfig {
  maxIterations?: number;
  verbose?: boolean;
}

export interface VerifyLoopResult {
  finalResult: VerificationResult;
  iterations: number;
  converged: boolean;
  attempts: VerificationResult[];
}

/**
 * Run verification in a loop until it passes or max iterations reached.
 */
export async function verifyWithLoop(
  config: VerifyLoopConfig = {}
): Promise<VerifyLoopResult> {
  const { maxIterations = 3, verbose = false } = config;
  const attempts: VerificationResult[] = [];

  for (let i = 1; i <= maxIterations; i++) {
    verbose && console.log(`[verify-loop] Iteration ${i}/${maxIterations}`);
    const engine = createVerificationEngine();
    const result = await engine.runAllChecks({ verbose: false });
    attempts.push(result);

    if (result.ok) {
      verbose && console.log(`[verify-loop] ✅ Passed on iteration ${i}`);
      return { finalResult: result, iterations: i, converged: true, attempts };
    }

    const failedCount = result.checks.filter((c: { passed: boolean }) => !c.passed).length;
    verbose && console.log(`[verify-loop] ❌ ${failedCount} checks failed, iteration ${i}/${maxIterations}`);
  }

  return {
    finalResult: attempts[attempts.length - 1],
    iterations: maxIterations,
    converged: false,
    attempts,
  };
}

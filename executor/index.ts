/**
 * executor — Lightweight stub for local type-check.
 */

export interface Executor {
  name(): string;
}

export function getExecutor(): Executor {
  return { name: () => 'stub-executor' };
}

/**
 * skill-manager — Lightweight stub for local type-check.
 */

export interface SkillDescriptor {
  name: string;
  version: string;
  description?: string;
}

export interface SkillRegistry {
  listSkills(): SkillDescriptor[];
  getAll(): SkillDescriptor[];
}

const REGISTRY: SkillDescriptor[] = [
  { name: 'autonomous-router', version: '0.1.0' },
  { name: 'codegraph', version: '0.1.0' },
  { name: 'error-recovery', version: '0.1.0' },
  { name: 'executor', version: '0.1.0' },
  { name: 'memory-store', version: '0.1.0' },
  { name: 'task-planner', version: '0.1.0' },
  { name: 'verification', version: '0.1.0' },
];

export function getSkillRegistry(): SkillRegistry {
  return {
    listSkills: () => [...REGISTRY],
    getAll: () => [...REGISTRY],
  };
}

export function createSkillOrchestrator(_config: Record<string, unknown> = {}): {
  plan(): Promise<{ steps: unknown[] }>;
} {
  return { plan: async () => ({ steps: [] }) };
}

/**
 * task-planner — Lightweight stub for local type-check.
 */

export interface Plan {
  steps: Array<{ id: string; title: string }>;
}

export interface TaskPlanner {
  createPlan(request: string): Plan;
}

export function getTaskPlanner(): TaskPlanner {
  return {
    createPlan(request: string): Plan {
      return {
        steps: [
          { id: '1', title: `Analyze: ${request.slice(0, 40)}` },
          { id: '2', title: 'Execute plan' },
          { id: '3', title: 'Verify result' },
        ],
      };
    },
  };
}

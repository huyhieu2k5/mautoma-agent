/**
 * capability-router — Lightweight stub for local type-check.
 *
 * The full implementation (multi-axis router + dispute tournament)
 * lives in the bundled Cursor plugin (`runtime/lib/`). For local
 * development and CLI usage this stub exposes the same surface so
 * `auto-apply` and downstream modules can be imported without
 * pulling in the full runtime.
 */

export interface RouterDecision {
  primary: string;
  primaryAxis?: string;
  score: number;
  championId: string | null;
  axes: Array<{ axis: string; score: number; primaryAxis?: string }>;
  disputeSession?: {
    sessionId: string;
    status: string;
    participants?: number;
    auditLogged?: boolean;
  } | null;
}

export interface RouterConfig {
  defaultLanguage?: 'vi' | 'en';
  confidenceThreshold?: number;
  maxAxesPerRequest?: number;
  autoExecute?: boolean;
  runDisputeOnRoute?: boolean;
  verbose?: boolean;
  skipTournament?: boolean;
}

export interface RouterInput {
  raw: string;
  language?: 'vi' | 'en';
}

export interface CapabilityRouter {
  route(input: RouterInput): Promise<RouterDecision>;
}

export function createCapabilityRouter(_config?: RouterConfig): CapabilityRouter {
  return {
    async route(input: RouterInput): Promise<RouterDecision> {
      const axis = input.raw.length > 0 ? 'execute' : 'idle';
      return {
        primary: axis,
        primaryAxis: axis,
        score: 0.5,
        championId: null,
        axes: [{ axis, score: 0.5, primaryAxis: axis }],
        disputeSession: null,
      };
    },
  };
}

export const CAPABILITY_AXES: Array<{ axis: string }> = [
  { axis: 'computer_control' },
  { axis: 'skill_install' },
  { axis: 'task_plan' },
  { axis: 'execute' },
  { axis: 'verify' },
  { axis: 'evolve' },
  { axis: 'remember' },
  { axis: 'analyze_code' },
  { axis: 'recover' },
  { axis: 'orchestrate' },
];

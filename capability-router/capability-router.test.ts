import { describe, it, expect } from 'vitest';
import {
  createCapabilityRouter,
  CAPABILITY_AXES,
  RouterConfig,
} from '../capability-router';

describe('capability-router', () => {
  it('exports exactly 10 capability axes', () => {
    expect(CAPABILITY_AXES).toHaveLength(10);
    const axisIds = CAPABILITY_AXES.map((a) => a.axis).sort();
    // Order is not part of the contract — only the set matters
    expect(new Set(axisIds)).toEqual(
      new Set([
        'analyze_code',
        'computer_control',
        'evolve',
        'execute',
        'orchestrate',
        'remember',
        'recover',
        'skill_install',
        'task_plan',
        'verify',
      ]),
    );
  });

  it('returns a RouterDecision with the expected shape', async () => {
    const router = createCapabilityRouter();
    const decision = await router.route({ raw: 'Refactor code' });
    expect(decision).toHaveProperty('primary');
    expect(decision).toHaveProperty('score');
    expect(decision).toHaveProperty('axes');
    expect(decision).toHaveProperty('championId');
    expect(decision).toHaveProperty('disputeSession');
    expect(Array.isArray(decision.axes)).toBe(true);
  });

  it('returns primary axis = "execute" for any non-empty input (stub behavior)', async () => {
    const router = createCapabilityRouter();
    const decision = await router.route({ raw: 'Fix bug please' });
    expect(decision.primary).toBe('execute');
    expect(decision.score).toBeCloseTo(0.5, 1);
  });

  it('returns primary axis = "idle" for empty input', async () => {
    const router = createCapabilityRouter();
    const decision = await router.route({ raw: '' });
    expect(decision.primary).toBe('idle');
  });

  it('respects runDisputeOnRoute=false and returns championId=null', async () => {
    const cfg: RouterConfig = { runDisputeOnRoute: false };
    const router = createCapabilityRouter(cfg);
    const decision = await router.route({ raw: 'hello' });
    expect(decision.championId).toBeNull();
  });
});
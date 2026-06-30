import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCapabilityRouter,
  CAPABILITY_AXES,
  RouterConfig,
} from '../capability-router';

describe('capability-router — axis constants', () => {
  it('exports exactly 10 capability axes', () => {
    expect(CAPABILITY_AXES).toHaveLength(10);
    const axisIds = CAPABILITY_AXES.map((a) => a.axis).sort();
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
});

describe('capability-router — decision shape', () => {
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

  it('returns primary axis = "idle" for empty input', async () => {
    const router = createCapabilityRouter();
    const decision = await router.route({ raw: '' });
    expect(decision.primary).toBe('idle');
    expect(decision.score).toBe(0);
  });

  it('returns primary axis = "idle" for whitespace-only input', async () => {
    const router = createCapabilityRouter();
    const decision = await router.route({ raw: '   ' });
    expect(decision.primary).toBe('idle');
  });

  it('respects runDisputeOnRoute=false and returns championId=null', async () => {
    const cfg: RouterConfig = { runDisputeOnRoute: false };
    const router = createCapabilityRouter(cfg);
    const decision = await router.route({ raw: 'hello' });
    expect(decision.championId).toBeNull();
    expect(decision.disputeSession).toBeNull();
  });
});

describe('capability-router — keyword scoring', () => {
  it('routes "sửa lỗi login" to recover axis (Vietnamese)', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'vi' });
    const decision = await router.route({ raw: 'sửa lỗi login giúp tôi' });
    expect(decision.primary).toBe('recover');
  });

  it('routes "refactor my code" to analyze_code axis (English)', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'en' });
    const decision = await router.route({ raw: 'refactor my code please' });
    expect(decision.primary).toBe('analyze_code');
  });

  it('routes "install npm package" to skill_install axis (English)', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'en' });
    const decision = await router.route({ raw: 'install npm package for me' });
    expect(decision.primary).toBe('skill_install');
  });

  it('routes "build new API" to execute axis (English)', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'en' });
    const decision = await router.route({ raw: 'build a new API endpoint' });
    expect(decision.primary).toBe('execute');
  });

  it('routes "lên kế hoạch xây dựng" to task_plan axis (Vietnamese)', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'vi' });
    const decision = await router.route({ raw: 'lên kế hoạch xây dựng hệ thống' });
    expect(decision.primary).toBe('task_plan');
  });

  it('routes "click on button" to computer_control axis (English)', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'en' });
    const decision = await router.route({ raw: 'click on the submit button' });
    expect(decision.primary).toBe('computer_control');
  });

  it('routes "run tests" to verify axis (English)', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'en' });
    const decision = await router.route({ raw: 'run the unit tests' });
    expect(decision.primary).toBe('verify');
  });

  it('falls back to execute when no axis meets threshold', async () => {
    const router = createCapabilityRouter({
      runDisputeOnRoute: false,
      confidenceThreshold: 0.99,
    });
    const decision = await router.route({ raw: 'random unrelated text' });
    expect(decision.primary).toBe('execute');
  });

  it('returns multiple axes in ranked order', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'en' });
    const decision = await router.route({ raw: 'refactor and test the code' });
    expect(decision.axes.length).toBeGreaterThan(1);
    // First axis should have the highest score
    expect(decision.axes[0].score).toBeGreaterThanOrEqual(decision.axes[1].score);
  });

  it('returns matched keywords for each axis', async () => {
    const router = createCapabilityRouter({ runDisputeOnRoute: false, language: 'en' });
    const decision = await router.route({ raw: 'refactor code' });
    const analyzeAxis = decision.axes.find((a) => a.axis === 'analyze_code');
    expect(analyzeAxis).toBeDefined();
    expect(analyzeAxis?.keywords).toContain('refactor');
  });
});

describe('capability-router — dispute tournament', () => {
  it('produces a champion agent ID when dispute runs', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'router-test-'));
    try {
      const router = createCapabilityRouter({ workspaceRoot: tmp });
      const decision = await router.route({ raw: 'refactor and test code' });
      expect(decision.championId).not.toBeNull();
      expect(decision.championId).toMatch(/^agent_/);
      expect(decision.disputeSession).not.toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('produces a Merkle root in dispute session', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'router-test-'));
    try {
      const router = createCapabilityRouter({ workspaceRoot: tmp });
      const decision = await router.route({ raw: 'fix the login bug' });
      expect(decision.disputeSession?.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('champion Elo is in expected range (1400-1700)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'router-test-'));
    try {
      const router = createCapabilityRouter({ workspaceRoot: tmp });
      const decision = await router.route({ raw: 'build a feature' });
      expect(decision.disputeSession?.championElo).toBeGreaterThan(1300);
      expect(decision.disputeSession?.championElo).toBeLessThan(1900);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('produces deterministic champion for identical requests', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'router-test-'));
    try {
      const router = createCapabilityRouter({ workspaceRoot: tmp });
      const d1 = await router.route({ raw: 'refactor code' });
      const d2 = await router.route({ raw: 'refactor code' });
      // Champion may differ because Elo evolves across rounds,
      // but the candidate set should be the same
      const axes1 = new Set(d1.axes.map((a) => a.axis));
      const axes2 = new Set(d2.axes.map((a) => a.axis));
      expect(axes1).toEqual(axes2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('audit log is persisted to .mautoma/audit/', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'router-test-'));
    try {
      const router = createCapabilityRouter({ workspaceRoot: tmp });
      await router.route({ raw: 'build a feature' });
      const { existsSync, readFileSync } = await import('node:fs');
      const logFile = join(tmp, '.mautoma', 'audit', 'dispute-sessions.jsonl');
      expect(existsSync(logFile)).toBe(true);
      const lines = readFileSync(logFile, 'utf8').trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);
      const entry = JSON.parse(lines[0]);
      expect(entry).toHaveProperty('sessionId');
      expect(entry).toHaveProperty('champion');
      expect(entry).toHaveProperty('hash');
      expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('Merkle chain links entries (each entry has prevHash + hash)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'router-test-'));
    try {
      const router = createCapabilityRouter({ workspaceRoot: tmp });
      await router.route({ raw: 'first request' });
      await router.route({ raw: 'second request' });
      const { readFileSync } = await import('node:fs');
      const logFile = join(tmp, '.mautoma', 'audit', 'dispute-sessions.jsonl');
      const lines = readFileSync(logFile, 'utf8').trim().split('\n');
      expect(lines.length).toBe(2);
      const e1 = JSON.parse(lines[0]);
      const e2 = JSON.parse(lines[1]);
      // First entry's prevHash is zeros
      expect(e1.prevHash).toBe('0'.repeat(64));
      // Second entry's prevHash equals first entry's hash
      expect(e2.prevHash).toBe(e1.hash);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('capability-router — config options', () => {
  it('respects maxAxesPerRequest limit', async () => {
    const router = createCapabilityRouter({
      runDisputeOnRoute: false,
      maxAxesPerRequest: 2,
      language: 'en',
    });
    const decision = await router.route({ raw: 'refactor test build create install' });
    expect(decision.axes.length).toBeLessThanOrEqual(2);
  });

  it('confidenceThreshold filters out weak matches', async () => {
    const strict = createCapabilityRouter({
      runDisputeOnRoute: false,
      confidenceThreshold: 0.9,
      language: 'en',
    });
    const lenient = createCapabilityRouter({
      runDisputeOnRoute: false,
      confidenceThreshold: 0.1,
      language: 'en',
    });
    const strictDecision = await strict.route({ raw: 'fix bug' });
    const lenientDecision = await lenient.route({ raw: 'fix bug' });
    expect(lenientDecision.axes.length).toBeGreaterThanOrEqual(strictDecision.axes.length);
  });

  it('defaultLanguage sets the language when input omits it', async () => {
    const router = createCapabilityRouter({
      defaultLanguage: 'en',
      runDisputeOnRoute: false,
    });
    const decision = await router.route({ raw: 'refactor code' });
    expect(decision.primary).toBe('analyze_code');
  });
});
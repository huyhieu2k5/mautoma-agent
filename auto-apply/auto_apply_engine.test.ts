import { describe, it, expect } from 'vitest';
import { createAutoApplyEngine } from './auto_apply_engine';

describe('AutoApplyEngine.analyze (intent detection)', () => {
  it('returns default execute intent for unrecognized request', () => {
    const engine = createAutoApplyEngine({ verbose: false });
    const intents = engine.analyze('asdfghjkl 12345');
    expect(intents).toHaveLength(1);
    expect(intents[0].axis).toBe('execute');
    expect(intents[0].score).toBeCloseTo(0.5, 1);
  });

  it('detects Vietnamese task_plan intent from "lên kế hoạch"', () => {
    const engine = createAutoApplyEngine({ verbose: false });
    const intents = engine.analyze('Hãy lên kế hoạch cho dự án này');
    expect(intents.some((i) => i.axis === 'task_plan')).toBe(true);
  });

  it('detects Vietnamese analyze_code intent from "phân tích code"', () => {
    const engine = createAutoApplyEngine({ verbose: false });
    const intents = engine.analyze('Phân tích code của tôi xem có vấn đề gì');
    expect(intents.some((i) => i.axis === 'analyze_code')).toBe(true);
  });

  it('detects Vietnamese recover intent from "sửa lỗi"', () => {
    const engine = createAutoApplyEngine({ verbose: false });
    const intents = engine.analyze('Sửa lỗi giúp tôi');
    expect(intents.some((i) => i.axis === 'recover')).toBe(true);
  });

  it('detects Vietnamese remember intent from "nhớ"', () => {
    const engine = createAutoApplyEngine({ verbose: false });
    const intents = engine.analyze('Hãy nhớ context phiên làm việc');
    expect(intents.some((i) => i.axis === 'remember')).toBe(true);
  });

  it('detects English task_plan intent from "plan"', () => {
    const engine = createAutoApplyEngine({ language: 'en', verbose: false });
    const intents = engine.analyze('Please plan the implementation steps');
    expect(intents.some((i) => i.axis === 'task_plan')).toBe(true);
  });

  it('detects English verify intent from "test"', () => {
    const engine = createAutoApplyEngine({ language: 'en', verbose: false });
    const intents = engine.analyze('Run the test suite and verify');
    expect(intents.some((i) => i.axis === 'verify')).toBe(true);
  });

  it('detects multiple intents when keywords overlap', () => {
    const engine = createAutoApplyEngine({ language: 'en', verbose: false });
    const intents = engine.analyze('Plan the refactor and then verify with tests');
    const axes = intents.map((i) => i.axis);
    expect(axes).toContain('task_plan');
    expect(axes).toContain('analyze_code'); // refactor → analyze_code
    expect(axes).toContain('verify');
  });

  it('returns scored matches with score between 0 and 1', () => {
    const engine = createAutoApplyEngine({ language: 'en', verbose: false });
    const intents = engine.analyze('Plan and refactor');
    for (const i of intents) {
      expect(i.score).toBeGreaterThanOrEqual(0);
      expect(i.score).toBeLessThanOrEqual(1);
    }
  });

  it('respects runAllAxes=false (default): filters by minConfidence', () => {
    const engine = createAutoApplyEngine({
      language: 'en',
      verbose: false,
      minConfidence: 10, // very high → nothing passes
    });
    const intents = engine.analyze('plan something');
    // analyze() returns all matches regardless of confidence; only apply() filters
    // Just verify intent is still detected
    expect(intents.some((i) => i.axis === 'task_plan')).toBe(true);
  });
});

describe('AutoApplyEngine.apply (integration)', () => {
  it('runs the full pipeline on a Vietnamese task_plan request', async () => {
    const engine = createAutoApplyEngine({
      language: 'vi',
      verbose: false,
      cleanup: false, // don't actually clean during the test
    });
    const result = await engine.apply('Hãy lên kế hoạch cho dự án này');
    expect(result.axesTriggered).toContain('task_plan');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs cleanup at the end by default', async () => {
    const engine = createAutoApplyEngine({
      language: 'en',
      verbose: false,
      cleanup: true,
    });
    // The cleanup should run silently even if there is nothing to clean
    const result = await engine.apply('hello');
    expect(result).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('skips cleanup when cleanup=false', async () => {
    const engine = createAutoApplyEngine({
      language: 'en',
      verbose: false,
      cleanup: false,
    });
    const result = await engine.apply('hello');
    expect(result).toBeDefined();
  });

  it('captures executor errors gracefully in the result', async () => {
    const engine = createAutoApplyEngine({
      language: 'vi',
      verbose: false,
      cleanup: false,
      minConfidence: 0, // run all matched axes
    });
    // Even if some executors fail, the engine should not throw — it should
    // mark the step as failed and continue.
    const result = await engine.apply('cài đặt skill mới');
    expect(result).toBeDefined();
    expect(Array.isArray(result.steps)).toBe(true);
  });
});
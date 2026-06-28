/**
 * AutoApply Engine module - Tự động phát hiện và áp dụng capabilities
 *
 * Usage:
 *   import { autoApply, createAutoApplyEngine } from './auto-apply';
 *
 *   // Quick
 *   const result = await autoApply('Tạo website bán hàng');
 *
 *   // Configurable
 *   const engine = createAutoApplyEngine({ verbose: true, language: 'vi' });
 *   const result = await engine.apply('Refactor code của tôi');
 *
 *   // Analyze only (dry-run)
 *   const intents = engine.analyze('Xây dựng API');
 *   console.log(intents);
 */

export {
  AutoApplyEngine,
  createAutoApplyEngine,
  autoApply,
} from './auto_apply_engine';

export type {
  CapabilityAxis,
  IntentMatch,
  ApplyResult,
  ApplyStep,
  AutoApplyConfig,
  AutoApplyContext,
} from './auto_apply_engine';
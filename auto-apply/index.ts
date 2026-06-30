/**
 * AutoApply Engine module — automatically detects and applies capabilities
 *
 * Usage:
 *   import { autoApply, createAutoApplyEngine } from './auto-apply';
 *
 *   // Quick
 *   const result = await autoApply('Create an e-commerce website');
 *
 *   // Configurable
 *   const engine = createAutoApplyEngine({ verbose: true, language: 'en' });
 *   const result = await engine.apply('Refactor my code');
 *
 *   // Analyze only (dry-run)
 *   const intents = engine.analyze('Build a new API');
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

export type {
  ExecutionPlan,
  ExecutionStep,
  ExecutionResult,
  AutoExecutionEngine,
  AutoExecutionConfig,
  PlanEnhancement,
} from '../auto-execution';

export {
  createAutoExecutionEngine,
  autoExecute,
} from '../auto-execution';

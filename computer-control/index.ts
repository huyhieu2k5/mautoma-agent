/**
 * computer-control — Full computer control facade (pure logic + dry-run)
 *
 * Exports:
 *  - createComputerControl() → ComputerControl
 *  - createWorkflows() → WorkflowRegistry
 *  - WorkflowBuilder → fluent workflow construction
 *  - ActionRateLimiter → token bucket for security
 */

export type {
  Point,
  ScreenRegion,
  KeyCombo,
  MouseButton,
  Action,
  ClickAction,
  MoveAction,
  ScrollAction,
  TypeAction,
  KeyAction,
  WaitAction,
  ScreenshotAction,
  AutomationStep,
  AutomationWorkflow,
  ActionResult,
  WorkflowRunResult,
  ComputerControl,
  ComputerControlConfig,
} from './types';

export { DefaultComputerControl } from './computer_control';
export { ActionRateLimiter } from './rate_limiter';
export { WorkflowBuilder, WorkflowRegistry } from './workflows';

import { DefaultComputerControl } from './computer_control';
import { WorkflowRegistry, WorkflowBuilder } from './workflows';
import type { ComputerControlConfig, ComputerControl } from './types';
import type { AutomationWorkflow } from './types';

/**
 * Factory — create a ComputerControl instance
 */
export function createComputerControl(config?: ComputerControlConfig): ComputerControl {
  return new DefaultComputerControl({ ...config, dryRun: config?.dryRun ?? true });
}

/**
 * Factory — create a WorkflowRegistry
 */
export function createWorkflows(storagePath?: string): WorkflowRegistry {
  return new WorkflowRegistry(storagePath);
}

/**
 * Convenience: build a workflow via callback
 */
export function buildWorkflow(
  id: string,
  name: string,
  description: string,
  build: (builder: WorkflowBuilder) => void
): AutomationWorkflow {
  const builder = new WorkflowBuilder(id, name, description);
  build(builder);
  return builder.build();
}
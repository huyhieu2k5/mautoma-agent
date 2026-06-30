/**
 * computer-control/types.ts — Shared types for computer control
 */

export type Point = { x: number; y: number };

export type ScreenRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type KeyCombo = string;  // e.g. "Ctrl+C", "Alt+F4"

export type MouseButton = 'left' | 'right' | 'middle';

export interface ClickAction {
  type: 'click';
  point: Point;
  button: MouseButton;
  count: number;
}

export interface MoveAction {
  type: 'move';
  point: Point;
}

export interface ScrollAction {
  type: 'scroll';
  point: Point;
  deltaX: number;
  deltaY: number;
}

export interface TypeAction {
  type: 'type';
  text: string;
  intervalMs: number;
}

export interface KeyAction {
  type: 'key';
  combo: KeyCombo;
}

export interface WaitAction {
  type: 'wait';
  ms: number;
}

export interface ScreenshotAction {
  type: 'screenshot';
  region?: ScreenRegion;
  outputPath?: string;
}

export type Action =
  | ClickAction
  | MoveAction
  | ScrollAction
  | TypeAction
  | KeyAction
  | WaitAction
  | ScreenshotAction;

export interface AutomationStep {
  id: string;
  name: string;
  action: Action;
  /** Optional failure handler */
  onError?: 'abort' | 'continue' | 'retry';
  /** Max retries for this step */
  retries?: number;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  steps: AutomationStep[];
  /** Created timestamp */
  createdAt: number;
}

export interface ActionResult {
  stepId: string;
  success: boolean;
  durationMs: number;
  /** Action-specific data (screenshot path, etc.) */
  data?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowRunResult {
  workflowId: string;
  totalSteps: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  results: ActionResult[];
  success: boolean;
}

export interface ComputerControlConfig {
  /** Rate limit: max actions per minute (default: 60) */
  rateLimitPerMin?: number;
  /** Action audit log path */
  auditLogPath?: string;
  /** Maximum audit entries to keep in memory */
  maxAuditEntries?: number;
  /** Default screenshot output dir */
  screenshotDir?: string;
  /** Disable actual platform invocation (default: false) */
  /** When true, only records/logs actions without side effects */
  dryRun?: boolean;
}

export interface ComputerControl {
  ready: boolean;
  /** Queue a click action */
  click(point: Point, options?: { button?: MouseButton; count?: number }): Promise<ActionResult>;
  /** Move mouse to point */
  move(point: Point): Promise<ActionResult>;
  /** Scroll wheel */
  scroll(point: Point, delta: { x: number; y: number }): Promise<ActionResult>;
  /** Type text */
  type(text: string, options?: { intervalMs?: number }): Promise<ActionResult>;
  /** Press key combo */
  pressKey(combo: KeyCombo): Promise<ActionResult>;
  /** Wait for duration */
  wait(ms: number): Promise<ActionResult>;
  /** Take screenshot (returns path) */
  screenshot(options?: { region?: ScreenRegion; outputPath?: string }): Promise<ActionResult>;
  /** Get current cursor position (best-effort, returns 0,0 if unavailable) */
  getCursorPosition(): Promise<Point>;
  /** Get screen size (best-effort, returns 1920x1080 default) */
  getScreenSize(): Promise<{ width: number; height: number }>;
  /** Run a workflow */
  runWorkflow(workflow: AutomationWorkflow): Promise<WorkflowRunResult>;
  /** Get audit log */
  getAuditLog(): ReadonlyArray<{ ts: number; action: string; details?: unknown }>;
  /** Flush audit log to disk */
  flushAuditLog(): Promise<void>;
}
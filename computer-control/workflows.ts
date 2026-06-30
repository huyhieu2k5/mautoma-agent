/**
 * computer-control/workflows.ts — Workflow builder + registry
 *
 * Lets users build reusable automation workflows (sequences of actions).
 * Workflows can be persisted to disk and shared.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AutomationWorkflow, AutomationStep, Action } from './types';

export class WorkflowBuilder {
  private workflow: AutomationWorkflow;

  constructor(id: string, name: string, description = '') {
    this.workflow = {
      id,
      name,
      description,
      steps: [],
      createdAt: Date.now(),
    };
  }

  addStep(id: string, name: string, action: Action, options?: { onError?: 'abort' | 'continue' | 'retry'; retries?: number }): this {
    const step: AutomationStep = {
      id,
      name,
      action,
      onError: options?.onError,
      retries: options?.retries,
    };
    this.workflow.steps.push(step);
    return this;
  }

  click(id: string, x: number, y: number, options?: { onError?: 'abort' | 'continue' | 'retry' }): this {
    return this.addStep(id, `Click (${x}, ${y})`, { type: 'click', point: { x, y }, button: 'left', count: 1 }, options);
  }

  type(id: string, text: string, options?: { onError?: 'abort' | 'continue' | 'retry' }): this {
    return this.addStep(id, `Type "${text.slice(0, 30)}"`, { type: 'type', text, intervalMs: 0 }, options);
  }

  pressKey(id: string, combo: string, options?: { onError?: 'abort' | 'continue' | 'retry' }): this {
    return this.addStep(id, `Press ${combo}`, { type: 'key', combo }, options);
  }

  wait(id: string, ms: number): this {
    return this.addStep(id, `Wait ${ms}ms`, { type: 'wait', ms });
  }

  screenshot(id: string, outputPath?: string): this {
    return this.addStep(id, 'Screenshot', { type: 'screenshot', outputPath });
  }

  build(): AutomationWorkflow {
    return { ...this.workflow, steps: [...this.workflow.steps] };
  }
}

export class WorkflowRegistry {
  private workflows: Map<string, AutomationWorkflow> = new Map();
  private readonly storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? '';
    this.load();
  }

  register(workflow: AutomationWorkflow): void {
    this.workflows.set(workflow.id, workflow);
    this.persist();
  }

  get(id: string): AutomationWorkflow | null {
    return this.workflows.get(id) ?? null;
  }

  list(): AutomationWorkflow[] {
    return Array.from(this.workflows.values());
  }

  remove(id: string): boolean {
    const removed = this.workflows.delete(id);
    if (removed) this.persist();
    return removed;
  }

  size(): number {
    return this.workflows.size;
  }

  clear(): void {
    this.workflows.clear();
    this.persist();
  }

  private persist(): void {
    if (!this.storagePath) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = Array.from(this.workflows.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // best-effort
    }
  }

  private load(): void {
    if (!this.storagePath) return;
    if (!fs.existsSync(this.storagePath)) return;
    try {
      const content = fs.readFileSync(this.storagePath, 'utf8');
      const arr = JSON.parse(content) as AutomationWorkflow[];
      for (const w of arr) this.workflows.set(w.id, w);
    } catch {
      // start empty
    }
  }
}
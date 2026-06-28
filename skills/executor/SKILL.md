---
name: executor
description: Thực thi task tự động — autonomous runner, subagent coordinator, parallel execution. Use for run, execute, do it, implement, "chạy task", "thực thi tự động".
---

# Executor

Run tasks autonomously — orchestrate subtasks, coordinate subagents, handle parallel execution with retry strategies.

## When to invoke
- Trigger phrases: "chạy task", "thực thi", "làm đi", "execute", "run this", "implement", "perform"
- Auto-routed from: capability-router (axis: `execute`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input (task description)
- `context`: { projectPath, files, framework, dependencies }
- `priority`: high

## Outputs the module returns
- `success`: boolean
- `artifacts`: { executedTasks[], results[], duration }
- `nextSuggestions`: ["task done — verify?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: every subtask execution logged
- Subagent spawn: bounded by agent budget (stepsUsed)
- File operations: validated paths, no path traversal

## Code references
- Entry: [executor/autonomous_runner.ts](../../executor/autonomous_runner.ts)
- Coordinator: [executor/subagent_coordinator.ts](../../executor/subagent_coordinator.ts)
- Tests: [tests/executor.test.ts](../../tests/executor.test.ts)
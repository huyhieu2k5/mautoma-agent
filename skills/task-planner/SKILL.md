---
name: task-planner
description: Phân rã dự án thành task tree, lập kế hoạch và lịch trình tự động. Use for plan, decompose, project, roadmap, milestone, schedule, "lên kế hoạch", "phân rã task".
---

# Task Planner

Decompose project → task tree → schedule. Manages dependencies, priorities, and execution order.

## When to invoke
- Trigger phrases: "lên kế hoạch", "phân rã dự án", "task tree", "roadmap", "milestone", "plan this", "break down", "schedule"
- Auto-routed from: capability-router (axis: `task_plan`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input (project description)
- `context`: { projectPath, files, framework }
- `priority`: medium

## Outputs the module returns
- `success`: boolean
- `artifacts`: { tasks[], dependencies[], schedule, milestones[] }
- `nextSuggestions`: ["plan đã tạo — execute?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: plan creation logged
- InputValidator: task descriptions, dependencies
- Plan persistence: validated JSON, no eval

## Code references
- Entry: [task-planner/project_decomposer.ts](../../task-planner/project_decomposer.ts)
- Scheduler: [task-planner/task_scheduler.ts](../../task-planner/task_scheduler.ts)
- Tests: [tests/task-planner.test.ts](../../tests/task-planner.test.ts)
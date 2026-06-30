---
name: auto-execution
description: "Auto-detect plans and execute them autonomously without confirmation, with self-upgrade when better approaches are found"
paths: ["**/auto-execution/**/*.ts"]
---
# Auto-Execution Engine

## What it does

When a user request contains a specific plan (keywords: plan, fix, create, implement, build, tạo, sửa, xây dựng...), this engine automatically:

1. **Detects** the intent from the request (VI + EN keywords)
2. **Creates** an execution plan via task-planner
3. **Self-upgrades** the plan by adding missing steps:
   - `Verify/test step` for feature requests
   - `Error handling step` for fix requests
   - `Git commit + memory store step` for create requests
   - `Backup step` before refactor
   - `Security check step` for auth-sensitive features
   - `Integration test step` for multi-module systems
   - `Cross-browser check step` for UI features
4. **Executes** all steps in dependency order (no confirmation needed)
5. **Stores** results in memory

## Usage

```typescript
import { autoExecute, createAutoExecutionEngine } from './auto-apply';

// Quick: auto-detect and execute
const result = await autoExecute('Fix the login bug', verbose: true);

// Advanced: configure behavior
const engine = createAutoExecutionEngine({
  autoExecute: true,
  allowSelfUpgrade: true,    // auto-add missing steps
  triggerThreshold: 0.4,     // when to trigger
  stopOnError: false,        // continue on failure
  language: 'vi',            // or 'en'
});

const { eligible } = engine.isAutoExecutionCandidate('Build a new API');
if (eligible) {
  const result = await engine.execute('Build a new API');
}
```

## Trigger keywords

**Vietnamese:** kế hoạch, lên kế hoạch, lộ trình, roadmap, các bước, tạo, xây dựng, làm, phát triển, sửa, fix, hoàn thành, thực hiện...

**English:** plan, roadmap, implement, build, create, develop, fix, refactor, complete, finish, execute, we need to, i will...

## Plan Enhancement (Self-Upgrade)

The engine automatically adds these steps if missing:

| Request Type | Auto-Added Step |
|---|---|
| Fix/bug | Error handling & edge cases |
| Create/add feature | Verification/test + git commit |
| Refactor/rewrite | Backup before refactor |
| Multi-module | Integration test |
| UI/frontend | Cross-browser check |
| Auth/security | Security validation |

## Integration with Auto-Apply

Auto-apply engine now checks for plan intent at the start of `apply()`. If detected, it delegates to AutoExecutionEngine and returns the execution result instead of running individual axes.

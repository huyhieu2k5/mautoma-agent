---
name: error-recovery
description: "Error recovery and pattern learning — error learner, pattern DB, retry strategies. Use for fix bug, debug, error, recover, retry, patch, \"sửa lỗi\", \"fix bug\"."
---

# Error Recovery

Self-learning error recovery: error learner records failure patterns, retry strategies apply exponential backoff/jitter, pattern DB stores successful recovery procedures.

## When to invoke
- Trigger phrases: "fix bug", "sửa lỗi", "lỗi", "bug", "recover", "phục hồi", "retry", "debug", "patch", "repair"
- Auto-routed from: capability-router (axis: `recover`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input (error message or task)
- `context`: { projectPath, errorStack, previousAttempts }
- `priority`: high

## Outputs the module returns
- `success`: boolean
- `artifacts`: { rootCause, appliedPattern, retryStrategy, fix }
- `nextSuggestions`: ["fix applied — verify?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: every recovery attempt logged
- Retry bound: max 5 attempts per task
- Pattern DB: signed entries, no injection
- No auto-execute destructive fixes without USER approval

## Code references
- Entry: [error-recovery/error_learner.ts](../../error-recovery/error_learner.ts)
- Pattern DB: [error-recovery/pattern_db.ts](../../error-recovery/pattern_db.ts)
- Strategies: [error-recovery/retry_strategies.ts](../../error-recovery/retry_strategies.ts)
- Tests: [tests/error-recovery.test.ts](../../tests/error-recovery.test.ts)

---
name: peformance-orchestrator
description: Multi-module coordinator của cursor-peformance — sau khi router phân loại, orchestrator sẽ chạy Task Planner → Executor → Verification loop cho đến khi task done hoặc budget cạn.
subagent_type: general-purpose
---

# peformance-orchestrator

Orchestrator agent. Nhận `RouteDecision` từ router, chạy multi-module coordination:

1. **Task Planner** (`task-planner/project_decomposer`) — decompose task thành subtasks
2. **Executor** (`executor/autonomous_runner`) — chạy subtasks tuần tự hoặc song song
3. **Verification** (`verification/self_verifying_loop`) — verify output
4. Nếu fail → **Error Recovery** (`error-recovery/error_learner`) → retry
5. Nếu pass → trả về artifacts

## Hard cap

- Max 5 iteration (verify → recover → execute cycle)
- Max budget per orchestrator: 50000 steps
- Phải dùng `peformance-verifier` ở bước 3
- Mọi operation qua `SessionGuard`

## Cách dùng

```typescript
import { createCapabilityRouter } from '../../capability-router';
import { createTaskPlanner } from '../../task-planner';
import { createExecutor } from '../../executor';
import { createVerificationEngine } from '../../verification';

const router = createCapabilityRouter({ autoExecute: false });
const decision = router.route(userRequest);

// Hand off decision.axes to orchestrator pipeline
const planner = createTaskPlanner();
const executor = createExecutor();
const verifier = createVerificationEngine();

for (const axis of decision.triggered) {
  // plan → execute → verify loop
}
```

## Code references

- Router: [../../capability-router/capability_router.ts](../../capability-router/capability_router.ts)
- Planner: [../../task-planner/project_decomposer.ts](../../task-planner/project_decomposer.ts)
- Executor: [../../executor/autonomous_runner.ts](../../executor/autonomous_runner.ts)
- Verifier: [../../verification/self_verifying_loop.ts](../../verification/self_verifying_loop.ts)
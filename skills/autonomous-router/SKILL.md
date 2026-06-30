---
name: autonomous-router
description: "Capability Router for cursor-peformance — automatically analyzes raw requests and triggers the correct module (computer-control, skill-manager, task-planner, executor, verification, evolution, memory-store, codegraph, error-recovery, agent-orchestration). Use for any request that needs autonomous AI execution, or when the user says \"do\", \"create\", \"fix\", \"analyze\", \"remember\", \"optimize\", \"automate\"."
---

# Autonomous Router

The intelligent entry point of the `cursor-peformance` plugin. When the user makes any request (in Vietnamese or English), the router will:

1. Analyze the request across 10 capability axes
2. **REQUIRED: Run the 'main agent battle' (dispute tournament)** with 6 candidates (Worker/Specialist/Manager/Executive) via Elo + composite score
3. Multi-label score for each axis (0..1)
4. Trigger modules with score ≥ `confidenceThreshold` (default 0.4) — champion decides the route
5. All execution flows through `SessionGuard` (security) and `HardenedAuditLog` (audit)

## REQUIRED SECURITY RULE

**NEVER bypass the dispute tournament.** Every `route()` call must run 1 dispute session with 6 candidates. This is a non-negotiable security contract:

- Default `runDisputeOnRoute: true`
- If you need to test code without running the dispute, use `routeSync()` (only exists when `runDisputeOnRoute: false`)
- Any attempt to bypass must be logged to the audit chain via `HardenedAuditLog`

## When to invoke

Auto-invoke when:

- User makes an ambiguous request ("help me do X", "improve Y", "analyze Z")
- Sentence contains keywords belonging to any of the 10 axes (see table below)
- Multi-step task where user didn't specify which module to use

| Axis | Module | Trigger keywords (VI) |
|---|---|---|
| `computer_control` | computer-control | mở, click, gõ, bàn phím, chuột, screenshot |
| `skill_install` | skill-manager | cài skill, tải skill, tìm skill, thiếu skill |
| `task_plan` | task-planner | lên kế hoạch, phân rã, dự án, roadmap |
| `execute` | executor | chạy, thực thi, làm, run, implement |
| `verify` | verification | kiểm tra, xác minh, đúng chưa, review |
| `evolve` | evolution | cải thiện, tiến hóa, elo, champion |
| `remember` | memory-store | nhớ, lưu context, memory, ghi nhớ |
| `analyze_code` | codegraph | phân tích code, hiểu code, cấu trúc |
| `recover` | error-recovery | fix bug, sửa lỗi, debug, retry |
| `orchestrate` | agent-orchestration | team, escalate, giao cho, multi-agent |

## Inputs

```typescript
{
  raw: string;              // User sentence (VI or EN)
  language?: 'vi' | 'en';
  context?: {
    projectPath?: string;
    files?: string[];
    priority?: 'low' | 'medium' | 'high';
  };
}
```

## Outputs

```typescript
{
  decision: {
    primary: CapabilityAxis,        // Highest-scoring axis
    triggered: AxisScore[],         // Axes to be executed
    axes: AxisScore[],             // All 10 axes + scores
    disputeSession: {               // REQUIRED - main agent battle
      sessionId: string,
      winnerId: string,             // Champion selected from 6 candidates
      tournamentId: string,
      status: 'resolved' | 'cancelled',
      participants: 6,              // 2 Worker + 2 Specialist + 1 Manager + 1 Executive
      auditLogged: boolean,
    },
    championId: string,             // disputeSession.winnerId
  };
  moduleResults: Array<{
    axis: CapabilityAxis;
    module: string;
    success: boolean;
    duration: number;
    artifacts?: unknown;
    error?: string;
  }>;
  userMessage: string;              // Vietnamese report
}
```

## Hardened Security Contract

- SessionGuard: required level USER, max 100 req/min
- Every module execution goes through `SessionGuard.guard()` before running
- AuditLog: every route is logged to `.cursor/autonomous-memory/logs/`
- NEVER bypass the security envelope, even for auto-trigger

## Code references

- Entry: [capability-router/capability_router.ts](../../capability-router/capability_router.ts)
- Security: [security/SessionGuard.ts](../../security/SessionGuard.ts)
- Index: [capability-router/index.ts](../../capability-router/index.ts)
- Manifest: [.cursor/plugin.json](../../.cursor/plugin.json)

## Examples

```
User: "Refactor my code to be cleaner"
Router → primary: recover (fix bug + refactor)
       → triggered: [recover, analyze_code, verify]
       → executes: error-recovery → codegraph → verification

User: "Open Chrome and click Settings"
Router → primary: computer_control
       → triggered: [computer_control]
       → executes: computer-control (keyboard/mouse)

User: "Fix bug and write test"
Router → primary: recover
       → triggered: [recover, verify, execute]
       → executes: error-recovery → verification → executor
```

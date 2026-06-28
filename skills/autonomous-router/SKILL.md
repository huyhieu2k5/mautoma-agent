---
name: autonomous-router
description: Capability Router của cursor-peformance — tự động phân tích yêu cầu thô và trigger đúng module (computer-control, skill-manager, task-planner, executor, verification, evolution, memory-store, codegraph, error-recovery, agent-orchestration). Use cho bất kỳ yêu cầu nào cần AI tự làm, hoặc khi user nói "làm", "tạo", "sửa", "phân tích", "nhớ", "tối ưu", "tự động".
---

# Autonomous Router

Entry point thông minh của plugin `cursor-peformance`. Khi user đưa ra yêu cầu bất kỳ (tiếng Việt hoặc tiếng Anh), router sẽ:

1. Phân tích yêu cầu qua 10 capability axes
2. **🛡️ BẮT BUỘC: Chạy 'cuộc chiến giành main agent' (dispute tournament)** với 6 candidates (Worker/Specialist/Manager/Executive) qua Elo + composite score
3. Multi-label score từng axis (0..1)
4. Trigger các module có score ≥ `confidenceThreshold` (mặc định 0.4) — champion quyết định route
5. Mọi execution đi qua `SessionGuard` (security) và `HardenedAuditLog` (audit)

## ⚠️ MANDATORY SECURITY RULE

**KHÔNG BAO GIỜ bypass dispute tournament.** Mỗi `route()` call bắt buộc chạy 1 dispute session với 6 candidates. Đây là security contract không thể bypass:

- Mặc định `runDisputeOnRoute: true`
- Nếu muốn test code mà không chạy dispute, dùng `routeSync()` (chỉ tồn tại khi `runDisputeOnRoute: false`)
- Mọi attempt bypass phải log vào audit chain qua `HardenedAuditLog`

## Khi nào invoke

Auto-invoke khi:

- User đưa ra yêu cầu mơ hồ ("giúp tôi làm X", "cải thiện Y", "phân tích Z")
- Câu chứa keyword thuộc bất kỳ 10 axes nào (xem bảng dưới)
- Multi-step task mà user không chỉ định rõ module nào dùng

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
  raw: string;              // Câu user (VI hoặc EN)
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
    primary: CapabilityAxis,        // axis có score cao nhất
    triggered: AxisScore[],         // axes sẽ được execute
    axes: AxisScore[],              // toàn bộ 10 axes + scores
    disputeSession: {               // 🛡️ BẮT BUỘC - cuộc chiến giành main agent
      sessionId: string,
      winnerId: string,             // Champion được chọn từ 6 candidates
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
  userMessage: string;              // Báo cáo tiếng Việt
}
```

## Hardened Security Contract

- SessionGuard: required level USER, max 100 req/min
- Mỗi module execution đều đi qua `SessionGuard.guard()` trước khi chạy
- AuditLog: mỗi route được log vào `.cursor/autonomous-memory/logs/`
- KHÔNG bypass security envelope dù là auto-trigger

## Code references

- Entry: [capability-router/capability_router.ts](../../capability-router/capability_router.ts)
- Security: [security/SessionGuard.ts](../../security/SessionGuard.ts)
- Index: [capability-router/index.ts](../../capability-router/index.ts)
- Manifest: [.cursor/plugin.json](../../.cursor/plugin.json)

## Ví dụ

```
User: "Refactor code của tôi cho sạch hơn"
Router → primary: recover (fix bug + sửa)
       → triggered: [recover, analyze_code, verify]
       → executes: error-recovery → codegraph → verification

User: "Mở Chrome và click Settings"
Router → primary: computer_control
       → triggered: [computer_control]
       → executes: computer-control (keyboard/mouse)

User: "Fix bug và viết test"
Router → primary: recover
       → triggered: [recover, verify, execute]
       → executes: error-recovery → verification → executor
```
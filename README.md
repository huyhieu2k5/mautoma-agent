# mautoma-agent

Autonomous AI Agent plugin cho Cursor IDE. Auto-applies mọi capability (computer-control, skills, planning, execution, verification, evolution, memory, codegraph, error-recovery, agent-orchestration) từ yêu cầu thô của user.

## Cài đặt

```
/add-plugin https://github.com/huyhieu2k5/mautoma-agent
```

## Cấu trúc

```
mautoma-agent/
├── plugin.json
├── skills/
│   ├── autonomous-router/      # ⭐ Capability Router
│   ├── computer-control/
│   ├── skill-manager/
│   ├── task-planner/
│   ├── executor/
│   ├── verification/
│   ├── evolution/
│   ├── memory-store/
│   ├── codegraph/
│   ├── error-recovery/
│   └── agent-orchestration/
├── agents/
│   ├── peformance-router.md
│   ├── peformance-orchestrator.md
│   └── peformance-verifier.md
├── rules/                      # ⭐ Always-applied (auto-router.md, security, ...)
├── hooks/                      # session-start, error-capture, skill-check, ...
└── scripts/
    └── capability-router-cli.ts  # ⭐ Auto-apply entry point
```

## Auto-apply cho mọi request

Plugin **TỰ ĐỘNG ÁP DỤNG** mọi skills cho mọi request của user mà user không cần yêu cầu.

Rule `auto-router.md` (alwaysApply: true) bắt Cursor parent agent **PHẢI** chạy CLI cho MỌI raw user request:

```bash
npx tsx scripts/capability-router-cli.ts --raw "<user request>"
```

Output: primary axis (skill/module cần invoke) + champion agent (từ dispute tournament) + dispute session ID.

## Bảo mật

Mọi operation đi qua SessionGuard + HardenedAuditLog. Xem `SECURITY.md` ở root.

## License

Dual-licensed: MIT hoặc Apache-2.0 (chọn 1). Xem `LICENSE-MIT` + `LICENSE-APACHE`.

# 🤖 mautoma-agent — Autonomous AI Agent Plugin for Cursor IDE

> Plugin **tự động áp dụng** mọi capability cho mọi request của user —
> không cần user biết gì về hệ thống.

---

## Installation

```bash
# Trong Cursor IDE, gõ:
/add-plugin https://github.com/huyhieu2k5/mautoma-agent
```

Hoặc cài local:

```bash
git clone https://github.com/huyhieu2k5/mautoma-agent.git
cd autonomous-agent
npm install
npm start
```

---

## 🚀 Sử dụng cơ bản

**Không cần biết gì!** Chỉ cần nói yêu cầu:

```bash
npm start
```

```
🤖 Nhập yêu cầu:
→ "Tạo website bán hàng"
→ "Phân tích code và tìm lỗi"
→ "Cài plugin mới"
→ "Lên kế hoạch dự án này"
→ "Refactor toàn bộ project"
```

Hệ thống tự động:
1. Phát hiện intent từ yêu cầu (10 axes)
2. Chọn capabilities phù hợp
3. Chạy theo thứ tự ưu tiên
4. Tự động dọn file thừa trước khi kết thúc

---

## 📋 10 Capability Axes

| Axis | Mô tả | Trigger |
|------|--------|---------|
| `computer_control` | Điều khiển chuột, bàn phím, vision | click, nhấn, chụp màn hình |
| `skill_install` | Cài skill/plugin/package | cài đặt, plugin, npm install |
| `task_plan` | Phân tích và lên kế hoạch | lên kế hoạch, roadmap, các bước |
| `analyze_code` | Phân tích, review, tìm lỗi | phân tích, refactor, tối ưu |
| `execute` | Tạo code, generate, build | tạo, xây dựng, viết code |
| `verify` | Kiểm tra, validate | test, kiểm tra, đảm bảo |
| `remember` | Ghi nhớ và truy xuất context | nhớ, ghi nhớ, bối cảnh |
| `evolve` | Tiến hóa chiến lược agent | tiến hóa, cải thiện agent |
| `recover` | Xử lý và phục hồi lỗi | sửa lỗi, retry, fallback |
| `orchestrate` | Phối hợp multi-agent | đội nhóm, ủy thác, multi-agent |

---

## 🛠️ Lệnh CLI

```bash
# Smart Runner (khuyên dùng)
npm start                     # Interactive
npm start -- "yêu cầu"       # Single request
npm run start:daemon          # Stay alive
npm run start:status          # Xem trạng thái

# Agent CLI
npm run agent                 # Interactive agent loop
npx tsx agent_cli.ts --continuous   # Continuous mode
npx tsx agent_cli.ts --router "yêu cầu"  # Chỉ xem router decision

# AI File Cleaner
npm run cleanup               # Chạy cleanup thật
npm run cleanup:dry-run       # Xem trước file sẽ xoá

# Plugin
npm run plugin:build          # Build bundle
npm run plugin:publish        # Build GitHub distribution
```

---

## 🧹 AI File Cleaner (Tự động)

Trước khi kết thúc **mọi request**, hệ thống tự động dọn file thừa do AI tạo ra.

### Pattern tự động xoá:
- `scratch*`, `draft*`, `temp*`, `tmp*`, `notes*`
- `summary*`, `recap*`, `overview*`, `cheatsheet*`
- `response*`, `output*`, `result*`, `answer*`
- `test-<name>.ts` (chỉ ở root)
- `todo*`, `plan*`, `design*`

### Protected (không xoá):
- `package.json`, `tsconfig.json`, `README.md`, `LICENSE`, `AGENTS.md`
- `.env`, `.gitignore`, `AI_NOTES.md`, dotfiles

### Ghi nhớ nội dung cần thiết:
File ≥ 50 chars → tự động merge vào `AI_NOTES.md` trước khi xoá.

### Xoá section khi hết cần thiết:
```bash
npm run cleanup -- --remove-note="keyword-trong-section"
```

---

## 🔒 Bảo mật

- **Hardened modules**: Authority, AuditLog, Evolution, Slots, Elo
- **HMAC-SHA256** cho authentication tokens
- **Input validation** trên mọi public API
- **Async locks** cho race conditions
- **Sealed singletons**

---

## 📁 Cấu trúc

```
autonomous-agent/
├── index.ts                  # Main exports
├── agent_loop.ts             # Agent loop + processOnce/processFile
├── agent_cli.ts              # CLI entry point
├── auto-apply/              # ⭐ Smart Runner + AutoApply Engine
│   ├── auto_apply_engine.ts # Engine phát hiện & áp dụng capabilities
│   ├── smart_runner.ts      # Smart Runner (chạy tự động)
│   └── index.ts
├── capability-router/        # Router quyết định capability
├── skill-manager/            # Quản lý skills
├── computer-control/          # Điều khiển chuột, bàn phím
├── evolution/                # Self-evolving agents (Elo, slots)
├── file-cleaner/            # ⭐ Auto-cleanup file thừa
├── codegraph/                # Phân tích cấu trúc codebase
├── memory-store/              # Ghi nhớ context
├── task-planner/             # Lên kế hoạch dự án
├── executor/                 # Thực thi code
├── verification/             # Kiểm tra kết quả
├── error-recovery/           # Xử lý lỗi
├── agent-orchestration/      # Multi-agent
├── hooks/                    # Session hooks
├── skills/                   # Curated skills
└── evolution/                # Self-evolving agents
```

---

## 📄 License

**COMBINED PERMISSIVE LICENSE** — Copyright (c) 2026 huyhieu2k5

Dual-licensed: MIT OR Apache-2.0

---

## 🔗 Links

- **GitHub**: https://github.com/huyhieu2k5/mautoma-agent
- **Plugin**: `/add-plugin https://github.com/huyhieu2k5/mautoma-agent`

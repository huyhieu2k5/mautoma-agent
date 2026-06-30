# 🤖 mautoma-agent — Plugin Agent AI tự động cho Cursor IDE

> Plugin **tự động áp dụng** mọi capability cho mọi request của user —
> không cần user biết gì về hệ thống.

**Ngôn ngữ / Languages:** [English](README.md) | [Tiếng Việt](README.vi.md) | [中文](README.zh.md)

---

[![CI](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/ci.yml)
[![Release](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/release.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/releases)
[![CodeQL](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/codeql.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/security/code-scanning)
[![npm version](https://img.shields.io/npm/v/mautoma-agent.svg)](https://www.npmjs.com/package/mautoma-agent)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)
[![Node ≥20](https://img.shields.io/badge/node-%E2%89%A520-339933.svg)](.nvmrc)

---

## Cài đặt

```bash
# Trong Cursor IDE, gõ:
/add-plugin https://github.com/huyhieu2k5/mautoma-agent
```

Hoặc cài local:

```bash
git clone https://github.com/huyhieu2k5/mautoma-agent.git
cd mautoma-agent
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
npm start -- "yêu cầu"        # Single request
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

## 🧹 AI File Cleaner (tự động)

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
mautoma-agent/
├── index.ts                  # Main exports
├── agent_cli.ts              # CLI entry point
├── auto-apply/               # ⭐ Smart Runner + AutoApply Engine
│   ├── auto_apply_engine.ts  # Engine phát hiện & áp dụng capabilities
│   ├── smart_runner.ts       # Smart Runner (chạy tự động)
│   └── index.ts
├── capability-router/        # Router quyết định capability
├── skill-manager/            # Quản lý skills
├── computer-control/         # Điều khiển chuột, bàn phím
├── evolution/                # Self-evolving agents (Elo, slots)
├── file-cleaner/             # ⭐ Auto-cleanup file thừa
├── codegraph/                # Phân tích cấu trúc codebase
├── memory-store/             # Ghi nhớ context
├── task-planner/             # Lên kế hoạch dự án
├── executor/                 # Thực thi code
├── verification/             # Kiểm tra kết quả
├── error-recovery/           # Xử lý lỗi
├── agent-orchestration/      # Multi-agent
├── hooks/                    # Session hooks
└── skills/                   # Curated skills (46)
```

---

## 📄 License

**COMBINED PERMISSIVE LICENSE** — Copyright (c) 2026 huyhieu2k5

Dual-licensed: MIT OR Apache-2.0

---

## 🔐 NPM Trusted Publishing (OIDC)

Repo này đã được cấu hình cho [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) — không cần `NPM_TOKEN` secret dài hạn. Workflow `.github/workflows/release.yml` dùng OIDC với permission `id-token: write`.

**Setup một lần trên npmjs.com:**

1. Vào **https://www.npmjs.com/settings/YOUR_USERNAME/automation** (hoặc org tương ứng cho `mautoma-agent`).
2. Click **"Add trusted publisher"**.
3. Điền:
   - **Publisher:** GitHub Actions
   - **Repository:** `huyhieu2k5/mautoma-agent`
   - **Workflow filename:** `release.yml`
   - **Environment name:** _(để trống)_
4. Save. Xong — không cần copy token.

**Verify sau lần release đầu tiên:**

```bash
npm view mautoma-agent dist.unpackedIntegrity
```

Package sẽ mang `--provenance` attestation (cũng hiện ở trang npm package dưới mục "Provenance").

**Fallback (nếu không dùng được Trusted Publishing):** thêm `NPM_TOKEN` secret trong GitHub repo settings → Secrets → Actions. Workflow có env var `NODE_AUTH_TOKEN` sẽ tự pick up.

---

## ⚠️ Status of Stub Modules

Một số module trong repo này là **stub nhẹ có chủ đích** cho local type-checking — implementation đầy đủ nằm ở Cursor plugin runtime đính kèm (`runtime/lib/`) và không thuộc package open-source này. Interface đã ổn định, nhưng thân các module này hiện trả về placeholder tĩnh:

| Module | Status | Cái đã implement | Cái đang stub |
|---|---|---|---|
| `security/SessionGuard` | 🟡 Stub | Public API surface (`getSessionGuard()`) | HMAC verification, rate limiting, audit calls |
| `security/DisputeSession` | 🟡 Stub | Public API surface (`getDisputeSessionManager()`) | Tournament orchestration, Merkle chain recording |
| `evolution/index` | 🟡 Stub | Public API surface (`createEvolutionEngine()`) | Elo rating, slot manager, `HardenedAuditLog`, `hardened_elo_system.ts` |
| `capability-router/index` | 🟡 Stub | 10-axis contract, type definitions | Multi-axis scoring, dispute tournament, real intent detection |
| `memory-store`, `executor`, `task-planner`, `error-recovery`, `codegraph`, `verification`, `computer-control`, `agent-orchestration`, `evaluation` | 🟡 Stubs | Public factory functions | Internal orchestration logic |

**Ảnh hưởng tới user:**

- Cursor plugin runtime **trong Cursor IDE của bạn** dùng implementation đầy đủ (bundle riêng). Stub chỉ liên quan nếu bạn import trực tiếp các module TypeScript của repo này vào Node code của mình.
- CLI (`scripts/capability-router-cli.ts`) chạy được với stub router — trả về output shape chuẩn để có thể build & test downstream tooling.
- Nếu dùng repo này như npm package (`mautoma-agent`), các `bin` script sẽ chạy nhưng các hành vi cốt lõi (Dispute tournament, Merkle audit log, Elo ranking) là placeholder cho tới khi full runtime ship về đây.

**Theo dõi quá trình chuyển stub → full tại [`CHANGELOG.md`](CHANGELOG.md).** Mỗi release sẽ chuyển ít nhất một module.

---

## 🔗 Links

- **GitHub**: https://github.com/huyhieu2k5/mautoma-agent
- **Plugin**: `/add-plugin https://github.com/huyhieu2k5/mautoma-agent`

---

## 🤝 CI/CD

Project chạy automated pipeline trên mỗi push và pull request:

| Workflow | Tác dụng |
|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Lint + format check + typecheck + tests (coverage) + build + manifest validation |
| [`release.yml`](.github/workflows/release.yml) | Trên tag `v*.*.*` → build, npm publish với provenance, GitHub Release |
| [`release-please.yml`](.github/workflows/release-please.yml) | Tự mở release PR với version bump + CHANGELOG |
| [`codeql.yml`](.github/workflows/codeql.yml) | CodeQL security scan hàng tuần cho JavaScript/TypeScript |
| [`security-audit.yml`](.github/workflows/security-audit.yml) | `npm audit --audit-level=high` + SBOM generation |
| [`labeler.yml`](.github/workflows/labeler.yml) | Auto-label PR theo area (module:capability-router, ci, docs, …) |
| [`validate-manifests.yml`](.github/workflows/validate-manifests.yml) | Validate `.cursor-plugin/plugin.json` + `app-manifest.json` + toàn bộ 46 skills mỗi lần thay đổi |

Dependabot mở PR hàng tuần để update npm dependencies và GitHub Actions.

Để chạy cùng các check local:

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run validate:manifest && npm run validate:skills
```

# 🤖 mautoma-agent — Autonomous AI Agent Plugin for Cursor IDE

> Plugin **tự động áp dụng** mọi capability cho mọi request của user —
> không cần user biết gì về hệ thống.

[![CI](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/ci.yml)
[![Release](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/release.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/releases)
[![CodeQL](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/codeql.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/security/code-scanning)
[![npm version](https://img.shields.io/npm/v/mautoma-agent.svg)](https://www.npmjs.com/package/mautoma-agent)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)
[![Node ≥20](https://img.shields.io/badge/node-%E2%89%A520-339933.svg)](.nvmrc)

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

## 🔐 NPM Trusted Publishing (OIDC)

This repo is set up for [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) — no long-lived `NPM_TOKEN` secret is required. The `.github/workflows/release.yml` workflow uses OIDC via the `id-token: write` permission.

**One-time setup on npmjs.com:**

1. Go to **https://www.npmjs.com/settings/YOUR_USERNAME/automation** (or the org equivalent for `mautoma-agent`).
2. Click **"Add trusted publisher"**.
3. Fill in:
   - **Publisher:** GitHub Actions
   - **Repository:** `huyhieu2k5/mautoma-agent`
   - **Workflow filename:** `release.yml`
   - **Environment name:** _(leave blank)_
4. Save. That's it — no token to copy.

**Verification after the first release:**

```bash
npm view mautoma-agent dist.unpackedIntegrity
```

The package will carry a `--provenance` attestation (also visible on the npm package page under "Provenance").

**Fallback (if you can't use Trusted Publishing):** add an `NPM_TOKEN` secret in GitHub repo settings → Secrets → Actions. The workflow has a `NODE_AUTH_TOKEN` env var that will pick it up automatically.

---

## ⚠️ Status of Stub Modules

Several modules in this repo are **intentional lightweight stubs** for local type-checking — the full implementations live in the bundled Cursor plugin runtime (`runtime/lib/`) and are not part of this open-source package. The interfaces are stable, but the body of these modules currently returns static placeholders:

| Module | Status | What's implemented | What's stubbed |
|---|---|---|---|
| `security/SessionGuard` | 🟡 Stub | Public API surface (`getSessionGuard()`) | HMAC verification, rate limiting, audit calls |
| `security/DisputeSession` | 🟡 Stub | Public API surface (`getDisputeSessionManager()`) | Tournament orchestration, Merkle chain recording |
| `evolution/index` | 🟡 Stub | Public API surface (`createEvolutionEngine()`) | Elo rating, slot manager, `HardenedAuditLog`, `hardened_elo_system.ts` |
| `capability-router/index` | 🟡 Stub | 10-axis contract, type definitions | Multi-axis scoring, dispute tournament, real intent detection |
| `memory-store`, `executor`, `task-planner`, `error-recovery`, `codegraph`, `verification`, `computer-control`, `agent-orchestration`, `evaluation` | 🟡 Stubs | Public factory functions | Internal orchestration logic |

**Implications for users:**

- The Cursor plugin runtime **in your Cursor IDE** uses the full implementations (bundled separately). The stubs only matter if you import this repo's TypeScript modules directly into your own Node code.
- The CLI (`scripts/capability-router-cli.ts`) works against the stub router today — it returns the canonical output shape so downstream tooling can be built and tested.
- If you're consuming this repo as an npm package (`mautoma-agent`), the `bin` scripts will run but the substantive behaviors (Dispute tournament, Merkle audit log, Elo ranking) are placeholders until the full runtime ships here.

**We track the migration in [`CHANGELOG.md`](CHANGELOG.md).** Each release will move at least one module from stub → full.

---

## 🔗 Links

- **GitHub**: https://github.com/huyhieu2k5/mautoma-agent
- **Plugin**: `/add-plugin https://github.com/huyhieu2k5/mautoma-agent`

---

## 🤝 CI/CD

This project runs an automated pipeline on every push and pull request:

| Workflow | What it does |
|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Lint + format check + typecheck + tests (coverage) + build + manifest validation |
| [`release.yml`](.github/workflows/release.yml) | On `v*.*.*` tag → build, npm publish with provenance, GitHub Release |
| [`release-please.yml`](.github/workflows/release-please.yml) | Auto-opens release PR with version bump + CHANGELOG |
| [`codeql.yml`](.github/workflows/codeql.yml) | Weekly CodeQL security scan for JavaScript/TypeScript |
| [`security-audit.yml`](.github/workflows/security-audit.yml) | `npm audit --audit-level=high` + SBOM generation |
| [`labeler.yml`](.github/workflows/labeler.yml) | Auto-labels PRs by area (module:capability-router, ci, docs, …) |
| [`validate-manifests.yml`](.github/workflows/validate-manifests.yml) | Validates `.cursor-plugin/plugin.json` + `app-manifest.json` + all 46 skills on every change |

Dependabot opens weekly PRs to update npm dependencies and GitHub Actions.

To run the same checks locally:

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run validate:manifest && npm run validate:skills
```

# 🤖 mautoma-agent — 面向 Cursor IDE 的自主 AI 代理插件

> 本插件**自动应用**所有能力到用户的每一个请求 —— 用户无需了解系统如何工作。

**语言 / Languages:** [English](README.md) | [Tiếng Việt](README.vi.md) | [中文](README.zh.md)

---

[![CI](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/ci.yml)
[![Release](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/release.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/releases)
[![CodeQL](https://github.com/huyhieu2k5/mautoma-agent/actions/workflows/codeql.yml/badge.svg)](https://github.com/huyhieu2k5/mautoma-agent/security/code-scanning)
[![npm version](https://img.shields.io/npm/v/mautoma-agent.svg)](https://www.npmjs.com/package/mautoma-agent)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)
[![Node ≥20](https://img.shields.io/badge/node-%E2%89%A520-339933.svg)](.nvmrc)

---

## 安装

```bash
# 在 Cursor IDE 中输入：
/add-plugin https://github.com/huyhieu2k5/mautoma-agent
```

或本地安装：

```bash
git clone https://github.com/huyhieu2k5/mautoma-agent.git
cd mautoma-agent
npm install
npm start
```

---

## 🚀 基础使用

**无需任何前置知识！** 只需描述你的需求：

```bash
npm start
```

```
🤖 请输入你的需求：
→ "创建一个电商网站"
→ "分析代码并查找 bug"
→ "安装新插件"
→ "规划这个项目"
→ "重构整个项目"
```

系统会自动：
1. 从请求中检测意图（10 个能力轴）
2. 选择合适的能力
3. 按优先级顺序执行
4. 在结束前自动清理多余文件

---

## 📋 10 个能力轴

| 轴 (Axis) | 说明 | 触发词 |
|------|-------------|----------|
| `computer_control` | 鼠标、键盘、视觉控制 | 点击、按键、截图 |
| `skill_install` | 安装 skill / 插件 / 包 | 安装、plugin、npm install |
| `task_plan` | 分析和规划 | 计划、路线图、步骤 |
| `analyze_code` | 分析、审查、查找 bug | 分析、重构、优化 |
| `execute` | 生成代码、构建 | 创建、构建、写代码 |
| `verify` | 测试、验证 | 测试、检查、确保 |
| `remember` | 记忆和检索上下文 | 记住、回忆、上下文 |
| `evolve` | 进化代理策略 | 进化、改进代理 |
| `recover` | 处理和恢复错误 | 修复 bug、重试、回退 |
| `orchestrate` | 多代理协调 | 团队、委派、多代理 |

---

## 🛠️ CLI 命令

```bash
# 智能运行器（推荐）
npm start                     # 交互模式
npm start -- "你的需求"       # 单次请求
npm run start:daemon          # 保持运行
npm run start:status          # 查看状态

# 代理 CLI
npm run agent                 # 交互式代理循环
npx tsx agent_cli.ts --continuous   # 持续模式
npx tsx agent_cli.ts --router "你的需求"  # 仅查看路由决策

# AI 文件清理
npm run cleanup               # 实际清理
npm run cleanup:dry-run       # 预览将要删除的文件

# 插件
npm run plugin:build          # 构建包
npm run plugin:publish        # 构建 GitHub 分发包
```

---

## 🧹 AI 文件清理（自动）

在**每个请求结束之前**，系统会自动清理 AI 生成的多余文件。

### 自动删除的模式：
- `scratch*`、`draft*`、`temp*`、`tmp*`、`notes*`
- `summary*`、`recap*`、`overview*`、`cheatsheet*`
- `response*`、`output*`、`result*`、`answer*`
- `test-<name>.ts`（仅在根目录）
- `todo*`、`plan*`、`design*`

### 受保护（永不删除）：
- `package.json`、`tsconfig.json`、`README.md`、`LICENSE`、`AGENTS.md`
- `.env`、`.gitignore`、`AI_NOTES.md`、点文件

### 删除前保留内容：
≥ 50 字符的文件会在删除前自动合并到 `AI_NOTES.md`。

### 不再需要时删除某个章节：
```bash
npm run cleanup -- --remove-note="section-中的-关键字"
```

---

## 🔒 安全性

- **加固模块**：Authority、AuditLog、Evolution、Slots、Elo
- **HMAC-SHA256** 用于身份认证令牌
- **输入验证** 覆盖所有公共 API
- **异步锁** 防止竞态条件
- **密封单例 (Sealed singletons)**

---

## 📁 项目结构

```
mautoma-agent/
├── index.ts                  # 主导出
├── agent_cli.ts              # CLI 入口
├── auto-apply/               # 智能运行器 + AutoApply 引擎
│   ├── auto_apply_engine.ts  # 检测并应用能力的引擎
│   ├── smart_runner.ts       # 智能运行器（自动运行）
│   └── index.ts
├── capability-router/         # 选择能力的路由器
├── skill-manager/             # skill 管理
├── computer-control/          # 鼠标、键盘控制
├── evolution/                 # 自进化代理 (Elo, slots)
├── file-cleaner/             # 自动清理多余文件
├── codegraph/                 # 代码结构分析
├── memory-store/              # 上下文记忆
├── task-planner/              # 项目规划
├── executor/                  # 代码执行
├── verification/              # 结果验证
├── error-recovery/            # 错误处理
├── agent-orchestration/       # 多代理
├── hooks/                     # 会话钩子
└── skills/                    # 精选 skills（46 个）
```

---

## 📄 许可证

**组合宽松许可证** — 版权所有 (c) 2026 huyhieu2k5

双重许可：MIT OR Apache-2.0

---

## 🔐 NPM 受信任发布 (OIDC)

本仓库已配置 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) —— 无需长期的 `NPM_TOKEN` 密钥。`.github/workflows/release.yml` 工作流通过 OIDC 与 `id-token: write` 权限配合使用。

**在 npmjs.com 上的一次性设置：**

1. 访问 **https://www.npmjs.com/settings/YOUR_USERNAME/automation**（或 `mautoma-agent` 对应的组织页面）。
2. 点击 **"Add trusted publisher"**。
3. 填写：
   - **Publisher：** GitHub Actions
   - **Repository：** `huyhieu2k5/mautoma-agent`
   - **Workflow filename：** `release.yml`
   - **Environment name：** _（留空）_
4. 保存。无需复制任何 token。

**首次发布后的验证：**

```bash
npm view mautoma-agent dist.unpackedIntegrity
```

该包将携带 `--provenance` 证明（在 npm 包页面的 "Provenance" 部分可见）。

**回退方案（如果无法使用 Trusted Publishing）：** 在 GitHub 仓库设置 → Secrets → Actions 中添加一个 `NPM_TOKEN` 密钥。工作流中的 `NODE_AUTH_TOKEN` 环境变量会自动使用它。

---

## ⚠️ 桩模块的状态

本仓库中有几个模块是**有意的轻量级桩 (stub)**，用于本地类型检查 —— 完整实现位于打包的 Cursor 插件运行时（`runtime/lib/`），不属于这个开源包。接口是稳定的，但这些模块的函数体目前返回静态占位符：

| 模块 | 状态 | 已实现 | 桩 |
|---|---|---|---|
| `security/SessionGuard` | 🟡 桩 | 公共 API 表面（`getSessionGuard()`） | HMAC 验证、速率限制、审计调用 |
| `security/DisputeSession` | 🟡 桩 | 公共 API 表面（`getDisputeSessionManager()`） | 锦标赛编排、Merkle 链记录 |
| `evolution/index` | 🟡 桩 | 公共 API 表面（`createEvolutionEngine()`） | Elo 评分、slot 管理器、`HardenedAuditLog`、`hardened_elo_system.ts` |
| `capability-router/index` | 🟡 桩 | 10 轴契约、类型定义 | 多轴评分、争议锦标赛、真实意图检测 |
| `memory-store`、`executor`、`task-planner`、`error-recovery`、`codegraph`、`verification`、`computer-control`、`agent-orchestration`、`evaluation` | 🟡 桩 | 公共工厂函数 | 内部编排逻辑 |

**对用户的影响：**

- **你 Cursor IDE 中的** Cursor 插件运行时使用完整实现（单独打包）。桩仅在你将本仓库的 TypeScript 模块直接导入到自己的 Node 代码中时才相关。
- CLI（`scripts/capability-router-cli.ts`）现在可针对桩路由器工作 —— 它返回规范的输出形状，因此可以构建和测试下游工具。
- 如果你以 npm 包（`mautoma-agent`）形式使用本仓库，`bin` 脚本可以运行，但实质性的行为（Dispute 锦标赛、Merkle 审计日志、Elo 排名）是占位符，直到完整运行时发布到此处。

**我们在 [`CHANGELOG.md`](CHANGELOG.md) 中跟踪迁移。** 每个版本都会将至少一个模块从桩迁移到完整实现。

---

## 🔗 链接

- **GitHub**：https://github.com/huyhieu2k5/mautoma-agent
- **插件**：`/add-plugin https://github.com/huyhieu2k5/mautoma-agent`

---

## 🤝 CI/CD

本项目在每次推送和拉取请求时都会运行自动化流水线：

| 工作流 | 作用 |
|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Lint + 格式检查 + 类型检查 + 测试（覆盖率）+ 构建 + 清单验证 |
| [`release.yml`](.github/workflows/release.yml) | 在 `v*.*.*` 标签上 → 构建、使用 provenance 发布到 npm、创建 GitHub Release |
| [`release-please.yml`](.github/workflows/release-please.yml) | 自动开启带版本号更新和 CHANGELOG 的发布 PR |
| [`codeql.yml`](.github/workflows/codeql.yml) | 每周 CodeQL 安全扫描，针对 JavaScript/TypeScript |
| [`security-audit.yml`](.github/workflows/security-audit.yml) | `npm audit --audit-level=high` + SBOM 生成 |
| [`labeler.yml`](.github/workflows/labeler.yml) | 按区域自动为 PR 打标签（module:capability-router, ci, docs, …） |
| [`validate-manifests.yml`](.github/workflows/validate-manifests.yml) | 在每次变更时验证 `.cursor-plugin/plugin.json` + `app-manifest.json` + 全部 46 个 skill |

Dependabot 每周开启 PR 以更新 npm 依赖和 GitHub Actions。

在本地运行相同的检查：

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run validate:manifest && npm run validate:skills
```

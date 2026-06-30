# Contributing to mautoma-agent

First off, thanks for taking the time to contribute! 🎉

This document walks you through setting up the project locally, running tests, and submitting changes.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Available Scripts](#available-scripts)
- [Project Layout](#project-layout)
- [Testing](#testing)
- [Commit Convention](#commit-convention)
- [Branch Naming](#branch-naming)
- [Pull Request Process](#pull-request-process)
- [Reporting Security Issues](#reporting-security-issues)

---

## 📜 Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## ✅ Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **20.11.1** (see `.nvmrc`) | Required by `engines.node` |
| npm | ≥ 10 | Locked via `package-lock.json` |
| Git | ≥ 2.30 | For hooks and pre-commit |
| Cursor / VS Code | latest | Recommended IDE |

Use [`nvm`](https://github.com/nvm-sh/nvm) or [`fnm`](https://github.com/Schniz/fnm) to install the exact Node version:

```bash
nvm install   # reads .nvmrc
nvm use
```

---

## 🚀 Setup

```bash
# 1. Clone
git clone https://github.com/huyhieu2k5/mautoma-agent.git
cd mautoma-agent

# 2. Install dependencies
npm install

# 3. Build (compiles TypeScript → dist/)
npm run build

# 4. Verify everything works
npm run typecheck
npm run lint
npm run test
```

After `npm install`, Husky installs a `pre-commit` and `commit-msg` hook automatically.

---

## 📜 Available Scripts

| Script | Purpose |
|---|---|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Verify formatting (CI mode) |
| `npm test` | Run unit tests with Vitest |
| `npm run test:watch` | Watch mode for TDD |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run validate:manifest` | Validate `.cursor-plugin/plugin.json` + `app-manifest.json` |
| `npm run validate:skills` | Verify every `skills/*/SKILL.md` has valid frontmatter |
| `npm run start` | Launch Smart Runner (interactive) |
| `npm run agent` | Launch Agent CLI |
| `npm run router -- --raw "..."` | Run CapabilityRouter CLI |
| `npm run cleanup` | Run AI file cleaner (real) |
| `npm run cleanup:dry-run` | Preview what the cleaner would do |

---

## 🗂️ Project Layout

```
mautoma-agent/
├── .github/                    # GitHub-specific config
│   ├── workflows/              # CI, release, security workflows
│   ├── labeler.yml             # Auto PR labels
│   └── dependabot.yml          # Weekly dependency updates
├── .cursor-plugin/             # Cursor plugin manifest
├── .cursor/                    # Cursor runtime hooks
├── schemas/                    # JSON schemas for plugin/app manifests
├── scripts/                    # CLI scripts (router, validators)
├── security/                   # SessionGuard, DisputeSession stubs
├── capability-router/          # 10-axis router
├── auto-apply/                 # AutoApply engine + smart runner
├── file-cleaner/               # AI artifact cleaner
├── skills/                     # 46 curated Cursor skills
├── rules/                      # Cursor rules (.mdc)
├── agents/                     # Cursor agent definitions (.md)
└── tsconfig.json               # TypeScript config (full include)
```

The repo ships **two** manifests on purpose — keep them in sync:

| File | Read by | Schema |
|---|---|---|
| `.cursor-plugin/plugin.json` | Cursor IDE | `schemas/cursor-plugin.schema.json` |
| `app-manifest.json` | npm runtime | `schemas/app-manifest.schema.json` |

---

## 🧪 Testing

We use **Vitest**. Tests live next to the source as `*.test.ts` files.

```bash
# Run all tests once
npm test

# Watch mode (TDD)
npm run test:watch

# With coverage report (opens HTML in ./coverage/index.html)
npm run test:coverage
```

When adding a new module or fixing a bug, please add or update tests. Coverage thresholds (currently 65% lines / 50% functions) are enforced in CI.

---

## ✍️ Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by `commitlint`.

Format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Common types:

| Type | Use for |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting (no code change) |
| `refactor` | Code change with no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system / dependencies |
| `ci` | CI configuration |
| `chore` | Tooling / housekeeping |

Examples:

```
feat(file-cleaner): add support for custom AI patterns via cleaner --pattern flag
fix(capability-router): resolve DisputeSession shape mismatch in CLI output
ci: add CodeQL workflow for weekly security scan
```

Header ≤ 100 characters; body lines ≤ 120.

---

## 🌿 Branch Naming

Use the format `<type>/<short-kebab-description>`:

```
feat/add-dockerfile
fix/capability-router-shape
docs/contributing-guide
chore/update-eslint-config
```

---

## 🔀 Pull Request Process

1. **Fork** and create a branch from `main`.
2. **Make your changes** with clear, focused commits.
3. **Ensure CI will pass locally**:
   ```bash
   npm run lint
   npm run format:check
   npm run typecheck
   npm test
   npm run build
   npm run validate:manifest
   npm run validate:skills
   ```
4. **Push** to your fork and **open a PR** against `main`.
5. **Fill in the PR template** — describe what changed, why, and how you tested.
6. Wait for CI to pass and a reviewer to approve.

The PR template lives at `.github/PULL_REQUEST_TEMPLATE.md`.

For non-trivial changes, please open an issue first to discuss direction.

---

## 🔒 Reporting Security Issues

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please follow the process in [`SECURITY.md`](SECURITY.md) — coordinated disclosure with a 48-hour acknowledgement window and a 7-day fix target.

---

## 📄 License

By contributing, you agree that your contributions will be dual-licensed under **MIT OR Apache-2.0**, matching the project's existing license.
# 🤖 mautoma-agent — Autonomous AI Plugin for Cursor IDE

> Auto-applies the right skill to every user request. Users don't need to know how the system works.

**Version:** 1.0.2 (slim distribution)
**License:** MIT

---

## What is this?

`mautoma-agent` is a Cursor plugin that wraps a `alwaysApply: true` rule plus a router skill. When you type any request, the router picks one of 10 capability axes and invokes the matching skill automatically:

| Axis | What it does |
|---|---|
| `execute` | Write / build / ship code |
| `verify` | Test, lint, validate |
| `analyze_code` | Read and review code |
| `task_plan` | Break down a request into steps |
| `remember` | Save and retrieve context across sessions |
| `recover` | Fix errors, retry, fall back |
| `evolve` | Improve strategies over time |
| `computer_control` | Drive the GUI / OS |
| `orchestrate` | Multi-agent coordination |
| `skill_install` | Install / update plugins and packages |

A dispute tournament (round-robin Elo over 6 candidate agents) picks the **champion** that actually executes. Every decision is appended to a tamper-evident Merkle audit log.

## Install

In Cursor IDE:

```
/add-plugin https://github.com/huyhieu2k5/mautoma-agent
```

Or install from a local clone:

```bash
git clone https://github.com/huyhieu2k5/mautoma-agent
```

## What's in the box

This is the **slim distribution**. It contains only what Cursor needs to install and run the plugin:

```
.cursor-plugin/plugin.json     ← manifest Cursor reads on /add-plugin
.cursor/hooks.json             ← session-start hook (dispute tournament)
rules/                         ← 4 alwaysApply rules
agents/                        ← 7 subagent definitions
skills/                        ← 47 skill definitions (SKILL.md each)
LICENSE                        ← MIT
README.md                      ← this file
.gitignore
```

Source code, tests, CI workflows, and the CLI are intentionally **not shipped** with the plugin — they live in a separate development repository. The plugin's rules and skills are self-contained: the router is implemented as instructions the Cursor agent itself follows, not as a TypeScript binary.

## How the auto-router works

1. **You type a request** in chat (any language, no prefix needed).
2. The `autonomous-router` skill is invoked (mandated by `rules/auto-router.mdc`).
3. The skill describes how to score the request across the 10 axes.
4. The top-scoring axes enter a **dispute tournament** — round-robin Elo over 6 candidate agents.
5. The champion executes the matching skill.
6. The decision is logged to the Merkle audit chain.

You should see roughly:

```
[router] primary=execute, score=0.82, champion=worker-1
[router] dispute resolved in 4 rounds, merkle root=abc123…
[executor] running build-feature skill…
```

## License

MIT — see [LICENSE](LICENSE).

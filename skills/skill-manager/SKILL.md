---
name: skill-manager
description: "Automatically find, install, and execute skills (including Cursor official plugins). Use for install skill, find skill, download skill, add plugin, missing skill, capability, or any request to extend what the agent can do."
---

# Skill Manager

Auto-discover skills from GitHub repos + Cursor official plugins + local registry. Apply skills automatically via AutoApplyEngine.

## When to invoke
- Trigger phrases: "cài skill", "tải skill", "tìm skill", "thêm khả năng", "thiếu skill", "plugin mới", "install skill", "download skill", "missing capability"
- Auto-routed from: capability-router (axis: `skill_install`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input
- `context`: { projectPath, files, framework }
- `priority`: medium

## Outputs the module returns
- `success`: boolean
- `artifacts`: { installedSkills[], installedPlugins[], downloadedFiles[] }
- `nextSuggestions`: ["skill mới đã cài — chạy thử?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: every install/download logged to `.cursor/autonomous-memory/logs/`
- InputValidator: skill names validated against `AGENT_ID_PATTERN`
- URL allowlist: chỉ download từ KNOWN_SKILL_REPOS + cursor/plugins
- File size limit: < 5MB per skill

## Code references
- Entry: [skill-manager/skill_manager.ts](../../skill-manager/skill_manager.ts)
- Downloader: [skill-manager/github_skill_downloader.ts](../../skill-manager/github_skill_downloader.ts)
- AutoApply: [skill-manager/auto_apply_engine.ts](../../skill-manager/auto_apply_engine.ts)
- Tests: [tests/skill-manager.test.ts](../../tests/skill-manager.test.ts)

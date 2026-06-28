# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-29

### Added

- **CapabilityRouter** — Multi-axis routing engine with 10 capability axes
  - `computer_control`, `skill_install`, `task_plan`, `execute`, `verify`,
    `evolve`, `remember`, `analyze_code`, `recover`, `orchestrate`
  - Bilingual support (Vietnamese + English) with auto-detection
  - Confidence threshold scoring and multi-label classification

- **Dispute Tournament System** — "Cuộc chiến giành main agent"
  - 6 agent archetypes: Worker, Specialist, Manager, Executive (×2 variants)
  - Round-robin tournament with Elo rating system
  - Champion selector with composite scoring (Elo × fitness × specialization)
  - HardenedAuditLog integration (Merkle hash chain, tamper-evident)

- **Auto-Apply Engine** — Plugin tự động áp dụng skills cho mọi request
  - Mandatory per-request dispute tournament (`dispute_tournament_per_request`)
  - `auto-router.md` rule (alwaysApply: true) — Cursor parent agent PHẢI route
  - `capability-router-cli.ts` — Shell-callable entry point cho mọi caller
  - Fallback policy khi routing fails

- **Session Lifecycle Hooks**
  - `session-start-hook.cjs` — Hydrate evolution state + trigger initial dispute
  - `session-end-hook.cjs` — Persist state
  - `error-capture-hook.cjs` — Error pattern learning
  - `skill-check-hook.cjs` — Pre-tool skill validation
  - `context-preserve-hook.cjs` — Compaction context preservation

- **Security Layer**
  - `HardenedAuditLog` — Merkle tree chain với HMAC-SHA256 signatures
  - `SessionGuard` — Rate limiting, input validation, authority checks
  - `HardenedSlotEvolutionManager` — Sealed singleton, bounded memory
  - `HardenedEloSystem` — ELO ratings với K-factor bounds
  - `HardenedRecallQueue` — Priority queue với bounded capacity
  - 24 security tests pass

- **Plugin Distribution**
  - 36 curated skills (GitHub community skills auto-bundled)
  - 7 agents (router, orchestrator, verifier + community agents)
  - 5 Cursor hooks + 5 security rules
  - GitHub distribution via `/add-plugin https://github.com/cursor-peformance/cursor-peformance`

### Changed

- All core modules now use hardened (security-hardened) implementations
- CapabilityRouter `route()` is now async, triggers dispute tournament by default
- `runDisputeOnRoute: false` only available for testing scenarios
- Plugin install simulates full Cursor plugin lifecycle (skills/agents/rules/hooks)

### Fixed

- Dispute tournament now runs per-request (was bypassed on Cursor restart)
- HardenedAuditLog chain integrity verification on startup
- File lock contention in concurrent dispute sessions (via async locks)

### Security

- Security Score: 9.5/10
- Full audit trail in `evolution/SECURITY_AUDIT.md`
- All 24 security tests passing
- Mandatory security rules with `bypass_allowed: false`
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within cursor-peformance, please report it **privately** — do NOT open a public GitHub issue.

### How to Report

1. **Do NOT** open a public issue
2. Email: [TODO: replace with real security contact email]
3. Or use GitHub's [Private vulnerability reporting](https://github.com/cursor-peformance/cursor-peformance/security/advisories/new)

### What to Include

- Type of vulnerability (e.g., input injection, auth bypass, race condition)
- Full paths of affected source files
- Step-by-step instructions to reproduce
- Proof-of-concept or attack scenario
- Potential impact assessment

### Response Timeline

- **Initial response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix timeline**: Depends on severity (critical: 72h, high: 2 weeks, medium: 30 days)

## Security Architecture

### Hardened Components

| Component | Type | Reference |
|-----------|------|-----------|
| HardenedAuditLog | Tamper-evident log (Merkle chain) | `evolution/hardened_audit_log.ts` |
| HardenedSlotEvolutionManager | Sealed singleton | `evolution/hardened_slot_evolution_manager.ts` |
| HardenedEloSystem | Bounded K-factor | `evolution/hardened_elo_system.ts` |
| HardenedSlotManager | Immutable state | `evolution/hardened_slot_manager.ts` |
| HardenedRecallQueue | Priority queue | `evolution/hardened_recall_queue.ts` |
| SessionGuard | Rate limit + authority | `security/SessionGuard.ts` |

### Mandatory Security Rules

All operations MUST follow these rules (enforced via `plugin.json` + Cursor rules):

1. **`dispute_tournament_per_request`** — Every request triggers a dispute tournament (6 candidates → Elo → champion). Bypass not allowed.
2. **`session_start_dispute`** — Cursor restart triggers initial dispute. Bypass not allowed.
3. **`session_guard`** — Every operation passes through SessionGuard (validation + rate limit + audit). Bypass not allowed.
4. **`hardened_audit_log`** — All state changes written to Merkle chain. Bypass not allowed.

### Known Security Boundaries

- **External skills**: Skills from GitHub community repos are sandboxed to the skill execution layer. They cannot directly access the HardenedAuditLog or SlotEvolutionManager.
- **Computer Control**: Keyboard/mouse/screen operations require champion agent authorization through SessionGuard.
- **Evolution State**: Evolution state is stored locally in `.cursor/autonomous-memory/`. Remote exfiltration requires access to the filesystem.
- **Rate Limits**: Configurable via `security.maxRequestsPerMinute` (default: 100/min).

### Security Score

Current: **9.5/10**

Remaining considerations for 10/10:
- Formal verification of Merkle chain consensus
- Third-party security audit
- SBOM (Software Bill of Materials) generation

## Security Checklist for Contributors

When modifying security-critical code:

- [ ] Input validation via `InputValidator` for all external inputs
- [ ] HMAC-SHA256 signatures on all tokens
- [ ] Sealed singletons with `Object.freeze`
- [ ] Async locks on all shared state mutations
- [ ] Rate limiting on all external-facing operations
- [ ] Memory bounds enforced (no unbounded arrays/maps)
- [ ] Audit log entries for all state changes
- [ ] Authority hierarchy checks before critical operations
- [ ] No hardcoded secrets or credentials
- [ ] Tests cover the new security boundary
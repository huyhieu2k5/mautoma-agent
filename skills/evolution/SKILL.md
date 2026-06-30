---
name: evolution
description: "Evolution pipeline — Elo rating, slot manager, priority recall queue, hardened audit log. Use for evolve, improve, optimize, elo, champion, \"improve agent\", \"evolve\"."
---

# Evolution

Multi-agent evolution: Elo rating system, slot-based ranking (1 Main + 5 Backup), priority recall queue, hardened audit log. Evolution triggered automatically after every session via **dispute tournament** (main agent selection battle).

## Main Agent Selection Battle — REQUIRED

Every time the user makes a request, the plugin MUST run 1 dispute tournament via `DisputeSessionManager` (see `security/DisputeSession.ts`):

```
6 candidates (PARTICIPANT_POOL):
  ├─ 2 Worker agents     (baseConfidence 0.50-0.55)
  ├─ 2 Specialist agents (baseConfidence 0.65-0.70)
  ├─ 1 Manager agent     (baseConfidence 0.80)
  └─ 1 Executive agent   (baseConfidence 0.90)
       ↓
Tournament (round-robin, Elo-rated)
       ↓
ChampionSelector picks winner
       ↓
HardenedAuditLog records session
       ↓
Champion ID is the main agent for this request
```

- On Cursor restart: `hooks/session-start-hook.cjs` automatically triggers 1 dispute tournament
- Per request: `CapabilityRouter.route()` automatically triggers 1 dispute tournament
- NEVER bypass the dispute session

## When to invoke
- Trigger phrases: "cải thiện agent", "tiến hóa", "tối ưu", "elo", "champion", "evolve", "improve", "optimize", "ranking"
- Auto-routed from: capability-router (axis: `evolve`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input
- `context`: { projectPath, performance metrics }
- `priority`: low

## Outputs the module returns
- `success`: boolean
- `artifacts`: { newPopulation, eloRanking, recallQueue, auditChain }
- `nextSuggestions`: ["evolution cycle done — try new champion?"]

## Hardened security contract
- SessionGuard: required level SYSTEM for evolution operations
- AuditLog: every state change logged to Merkle chain (immutable)
- InputValidator: agent IDs, fitness scores
- Sealed singletons: SlotEvolutionManager, EloSystem, AuditLog
- Population invariants: 1 Main + 5 Backup = 6 slots enforced

## Code references
- Entry: [evolution/hardened_slot_evolution_manager.ts](../../evolution/hardened_slot_evolution_manager.ts)
- Elo: [evolution/hardened_elo_system.ts](../../evolution/hardened_elo_system.ts)
- Audit: [evolution/hardened_audit_log.ts](../../evolution/hardened_audit_log.ts)
- Tests: [tests/evolution.test.ts](../../tests/evolution.test.ts)

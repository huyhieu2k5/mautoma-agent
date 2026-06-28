---
name: agent-orchestration
description: Điều phối team/escalation — agent tiers (worker → specialist → manager → executive → supreme), teams (arena, interrogate, supervisor, hierarchical). Use for team, orchestrate, escalate, delegate, multi-agent, "đội", "giao cho".
---

# Agent Orchestration

Multi-agent coordination: 5-tier hierarchy (WORKER → SPECIALIST → MANAGER → EXECUTIVE → SUPREME), team patterns (arena = parallel candidates with judge, interrogate = multi-model review, supervisor = route to specialists, hierarchical = tree exec).

## When to invoke
- Trigger phrases: "đội", "team", "phối hợp", "escalate", "giao cho", "orchestrate", "delegate", "coordinate", "multi-agent"
- Auto-routed from: capability-router (axis: `orchestrate`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input
- `context`: { projectPath, complexity, requiresMultiModel }
- `priority`: medium

## Outputs the module returns
- `success`: boolean
- `artifacts`: { agentAssignments, teamResults, escalations }
- `nextSuggestions`: ["team done — pick best?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: every escalation/team execution logged
- Agent budget: each agent has step budget + confidence threshold
- Veto power: EXECUTIVE can veto, SUPREME has final authority
- Tier invariants: lower tiers MUST escalate, not bypass

## Code references
- Entry: [agent-orchestration/agent_escalation.ts](../../agent-orchestration/agent_escalation.ts)
- Teams: [agent-orchestration/agent_teams.ts](../../agent-orchestration/agent_teams.ts)
- Tiers: [agent-orchestration/authority_tiers.ts](../../agent-orchestration/authority_tiers.ts)
- Tests: [tests/orchestration.test.ts](../../tests/orchestration.test.ts)
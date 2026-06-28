---
name: memory-store
description: Lưu trữ và nhớ context — memory manager, context chunker, persistence. Use for remember, memory, context, persist, save, recall, "nhớ lại", "lưu context".
---

# Memory Store

Cross-session persistence: memory manager with chunking, disk persistence, recall interface.

## When to invoke
- Trigger phrases: "nhớ", "lưu", "context", "memory", "lưu lại", "ghi nhớ", "remember", "persist", "recall", "save context"
- Auto-routed from: capability-router (axis: `remember`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input
- `context`: { projectPath, sessionId, keys[] }
- `priority`: medium

## Outputs the module returns
- `success`: boolean
- `artifacts`: { storedKeys[], recalledValues[], chunkCount }
- `nextSuggestions`: ["đã lưu — try next session?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: every store/recall operation logged
- InputValidator: keys, values (size limit 10KB per entry)
- No secrets in memory: encrypted before disk persistence
- TTL: entries expire after configurable duration

## Code references
- Entry: [memory-store/memory_manager.ts](../../memory-store/memory_manager.ts)
- Chunker: [memory-store/context_chunker.ts](../../memory-store/context_chunker.ts)
- Persistence: [memory-store/persistence.ts](../../memory-store/persistence.ts)
- Tests: [tests/memory-store.test.ts](../../tests/memory-store.test.ts)
---
name: verification
description: "Self-verification — self-verifying loop, LATS tree search, committee review, RAG. Use for verify, check, validate, review, \"kiểm tra code\", \"xác minh\", \"đúng chưa\"."
---

# Verification

Self-verification: prove output works against real artifacts (not just "it compiles"). Multi-model committee review, LATS tree search for non-trivial decisions, self-RAG for retrieval grounding.

## When to invoke
- Trigger phrases: "kiểm tra code", "xác minh", "đúng chưa", "verify", "check", "review code", "validate", "audit", "prove it works"
- Auto-routed from: capability-router (axis: `verify`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input
- `context`: { projectPath, files, framework, targetArtifact }
- `priority`: medium

## Outputs the module returns
- `success`: boolean
- `artifacts`: { verificationReport, latsTree?, committeeReview, confidence }
- `nextSuggestions`: ["verify xong — fix issues?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: verification result logged
- Test isolation: verified in sandbox, not production
- No bypass: every code change MUST be verified before declaring done

## Code references
- Entry: [verification/self_verifying_loop.ts](../../verification/self_verifying_loop.ts)
- LATS: [verification/lats_tree_search.ts](../../verification/lats_tree_search.ts)
- Committee: [verification/committee_review.ts](../../verification/committee_review.ts)
- Tests: [tests/verification.test.ts](../../tests/verification.test.ts)

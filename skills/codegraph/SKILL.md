---
name: codegraph
description: Phân tích codebase — code structure analyzer, LRU context cache, auto-cleaner. Use for analyze code, read code, understand, graph, codegraph, structure, parse.
---

# Codegraph

Efficient codebase access: AST-based code structure analyzer, LRU context cache (avoid re-reads), file cleaner (auto-remove redundant files).

## When to invoke
- Trigger phrases: "phân tích code", "đọc code", "hiểu code", "cấu trúc", "graph", "codegraph", "analyze", "structure", "parse"
- Auto-routed from: capability-router (axis: `analyze_code`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input
- `context`: { projectPath, files, framework }
- `priority`: medium

## Outputs the module returns
- `success`: boolean
- `artifacts`: { nodes[], edges[], symbols[], imports[], exports[] }
- `nextSuggestions`: ["graph built — query specific symbol?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: every analysis logged
- File access: validated paths, no path traversal
- Cache size: bounded LRU (max entries configurable)
- Resource limit: max file size 10MB per analysis

## Code references
- Entry: [codegraph/codegraph_analyzer.ts](../../codegraph/codegraph_analyzer.ts)
- Cache: [codegraph/context_cache.ts](../../codegraph/context_cache.ts)
- Cleaner: [codegraph/file_cleaner.ts](../../codegraph/file_cleaner.ts)
- Tests: [tests/codegraph.test.ts](../../tests/codegraph.test.ts)
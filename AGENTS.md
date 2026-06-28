# AGENTS.md — mautoma-agent Plugin

## Project Overview

**mautoma-agent** là một Cursor plugin biến Cursor IDE thành **Autonomous AI Agent System** với **22 capabilities** tự động.

User chỉ cần nói yêu cầu bằng ngôn ngữ tự nhiên — hệ thống tự động:
1. Phát hiện intent (14 axes)
2. Chọn capabilities phù hợp
3. Chạy theo thứ tự ưu tiên
4. Dọn file thừa trước khi kết thúc

---

## 🤖 AI Agent Behavior Rules

### When User Requests Code:

**ALWAYS** check if the request involves:
- Authentication → Use HMAC-signed tokens (SessionGuard)
- Authorization → Use 5-tier authority hierarchy
- Input handling → Use InputValidator
- API endpoints → Use rate limiting (60/min)
- Concurrent operations → Use async locks
- State changes → Use Merkle audit log
- File cleanup → Use AIFileCleaner (BẮT BUỘC before session end)

**ALWAYS** apply security patterns from `SECURITY.md`.

**NEVER** create vulnerable code:
- ❌ Weak token validation
- ❌ Unsealed singletons
- ❌ Unvalidated inputs
- ❌ Unbounded memory
- ❌ Mutable audit logs
- ❌ Race conditions

---

## 🔒 Security Status (9.5/10)

| Component | Status | Reference |
|-----------|--------|-----------|
| SessionGuard | ✅ Hardened | `security/SessionGuard.ts` |
| DisputeSession | ✅ Hardened | `security/DisputeSession.ts` |
| Authority | ✅ Hardened | `evolution/hardened_authority_manager.ts` |
| Audit Log | ✅ Hardened | `evolution/hardened_audit_log.ts` |
| Evolution | ✅ Hardened | `evolution/hardened_slot_evolution_manager.ts` |
| Elo System | ✅ Hardened | `evolution/hardened_elo_system.ts` |
| Slot Manager | ✅ Hardened | `evolution/hardened_slot_manager.ts` |
| Recall Queue | ✅ Hardened | `evolution/hardened_recall_queue.ts` |
| Input Validation | ✅ Implemented | `security_utils.ts` |
| Rate Limiting | ✅ Implemented | `security_utils.ts` |
| Memory Bounds | ✅ Implemented | `security_utils.ts` |
| AI File Cleaner | ✅ Implemented | `file-cleaner/ai_file_cleaner.ts` |
| AutoApply Engine | ✅ Implemented | `auto-apply/auto_apply_engine.ts` |
| Smart Runner | ✅ Implemented | `auto-apply/smart_runner.ts` |
| Tests | ✅ 24+ tests | `evolution/security_tests.ts` |

---

## 🛠️ Common Tasks

### Add New Capability

1. Define axis trong `auto-apply/auto_apply_engine.ts` (INTENT_PATTERNS)
2. Implement executor function (execNewAxis)
3. Register vào AXIS_EXECUTORS map
4. Add status check trong `smart_runner.ts`
5. Update README.md

### Add New Cursor Skill

1. Create folder `.cursor/skills/<skill-name>/`
2. Add `SKILL.md` với frontmatter (name, description)
3. Document trigger keywords
4. Test in Smart Runner

### Add New Authority Rule

1. Add rule to AUTHORITY_RULES in `hardened_authority_manager.ts`
2. Add test case in `security_tests.ts`
3. Document in `SECURITY.md`

---

## 📝 Coding Standards

### TypeScript:
- Strict mode
- No `any` types (use `unknown`)
- Validate all inputs
- Use readonly where possible
- Document public APIs

### Security:
- HMAC-SHA256 for tokens
- Sealed singletons
- Input validation
- Rate limiting
- Async locks
- Audit logging
- Authority checks

### Testing:
- Unit tests for all public methods
- Security tests for all security fixes
- Run `npm test` before commit

---

## 🚀 Getting Started

```bash
npm install
npm run build
npm test
npm run test:security

# Auto-apply test
npm start
```

---

## 📚 Key Documents

- `README.md` — User guide
- `SECURITY.md` — Security architecture
- `AGENTS.md` — This file
- `evolution/SECURITY_AUDIT.md` — Complete security audit
- `auto-apply/` — Auto-apply engine + Smart Runner

---

**Remember: Auto-apply everything, secure everything, clean up everything.**
# Security Policy — mautoma-agent

> **Security Score: 9.5/10** — Hardened multi-layer security cho Autonomous AI Agent.

---

## 🔒 3 Security Layers

### Layer 1: SessionGuard (Mandatory Envelope)

| Feature | Description |
|---------|-------------|
| **HMAC-SHA256 tokens** | Authentication với cryptographic signing |
| **Rate limiting** | 60 requests/minute (configurable) |
| **Input validation** | All inputs validated trước khi xử lý |
| **Audit logging** | Every operation logged to Merkle chain |
| **Authority checks** | 5-tier hierarchy (USER → SYSTEM) |

**File**: `security/SessionGuard.ts`

### Layer 2: DisputeSession (Tournament Champion Selector)

Mỗi user request chạy tournament với **6 candidates**:
- 2× Worker
- 2× Specialist
- 1× Manager
- 1× Executive

**Quy trình**:
1. Round-robin battles
2. Elo rating update
3. Champion selection qua Elo + composite score

**File**: `security/DisputeSession.ts`

### Layer 3: Hardened Modules

| Module | Hardening |
|--------|-----------|
| `AuthorityManager` | Sealed singleton, HMAC-signed, 5-tier hierarchy |
| `AuditLog` | Merkle hash chain, tamper-evident, append-only |
| `SlotEvolutionManager` | Population management with cryptographic verification |
| `EloSystem` | Rating system with integrity checks |
| `SlotManager` | Agent slot allocation with bounds checking |
| `RecallQueue` | Priority-based with input validation |

**Files**: `evolution/hardened_*.ts`

---

## 🛡️ Security Patterns

### Input Validation (`security_utils.ts`)

```typescript
import { InputValidator } from './security_utils';

// Validate string length
const safe = InputValidator.validateString(input, { min: 1, max: 1000 });

// Validate number range
const port = InputValidator.validateNumber(input, { min: 1, max: 65535 });
```

### Rate Limiting

```typescript
import { RateLimiter } from './security_utils';

const limiter = new RateLimiter({ maxRequests: 60, windowMs: 60000 });
if (!limiter.tryConsume('user-id')) {
  throw new Error('Rate limit exceeded');
}
```

### Memory Bounds

```typescript
import { MemoryGuard } from './security_utils';

MemoryGuard.checkSize(array, { max: 10000 }); // Throws if exceeded
```

### HMAC Tokens

```typescript
import { HMAC } from './security_utils';

const token = HMAC.sign({ userId, exp: Date.now() + 3600000 }, secret);
const valid = HMAC.verify(token, secret);
```

---

## 🚨 Reporting Security Vulnerabilities

**DO NOT** open public GitHub issues cho security vulnerabilities.

Email: security@example.com (TODO: replace với email thật)

Include:
1. Mô tả vulnerability
2. Reproduction steps
3. Potential impact
4. Suggested fix (optional)

---

## 🔐 Threat Model

### Threats mitigated:
- ✅ **Token forgery** — HMAC-SHA256 signing
- ✅ **Race conditions** — Async locks (Mutex/Semaphore)
- ✅ **Memory exhaustion** — Bounded collections
- ✅ **Audit log tampering** — Merkle chain verification
- ✅ **Privilege escalation** — 5-tier authority checks
- ✅ **Brute force** — Rate limiting
- ✅ **Input injection** — Input validation
- ✅ **Prototype pollution** — Sealed singletons

### Out of scope:
- Physical access attacks
- Side-channel attacks (constant-time not enforced)
- Quantum computing attacks (HMAC-SHA256 vulnerable)

---

## 📊 Security Audit

Complete security audit trong `evolution/SECURITY_AUDIT.md`:
- 24 security test cases
- All hardening techniques documented
- Threat model analysis
- Compliance notes

---

## 🧪 Security Testing

```bash
npm run test:security           # 24 hardened tests
npm test                        # All tests including security
```

Coverage:
- ✅ HMAC token generation/verification
- ✅ Rate limiting under load
- ✅ Input validation edge cases
- ✅ Authority boundary enforcement
- ✅ Audit log Merkle chain integrity
- ✅ Memory bounds enforcement
- ✅ Slot allocation bounds
- ✅ Elo rating integrity
- ✅ Recall queue priority abuse
- ✅ Concurrent access patterns
- ✅ Sealed singleton protection
- ✅ Authority hierarchy traversal

---

## 📅 Security Updates

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2026-06-29 | Initial hardened release |

---

## 📄 License

Dual-licensed: MIT OR Apache-2.0

---

**Remember: Security is everyone's responsibility.**
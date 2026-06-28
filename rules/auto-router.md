---
description: cursor-peformance — AUTO-ROUTER: Mọi raw user request phải qua CapabilityRouter (autonomous-router skill) + dispute tournament
globs: ["**/*"]
alwaysApply: true
references:
  - "@c:\\Users\\VanPhong\\Documents\\Cursor-Peformance\\autonomous-agent\\capability-router\\SKILL.md"
  - "@c:\\Users\\VanPhong\\Documents\\Cursor-Peformance\\autonomous-agent\\.cursor\\plugin.json"
---

# cursor-peformance — AUTO-ROUTER (Mandatory)

## 🚨 RULE: MỌI raw user request BẮT BUỘC qua CapabilityRouter

Khi user gõ BẤT KỲ request nào vào chat (kể cả khi user không prefix `/agent`, không gọi router, không yêu cầu), Cursor parent agent **PHẢI** tự routing request đó qua CapabilityRouter trước khi xử lý.

Đây là plugin của **autonomous AI agent system** — mục đích là **tự động áp dụng skills** cho mọi request người dùng, không yêu cầu user biết về router hay dispute tournament.

## 🎯 WHY (Tại sao bắt buộc)

1. Plugin có **10 axes** (computer-control, skill-install, task-plan, execute, verify, evolve, remember, analyze-code, recover, orchestrate). User không cần biết axis nào phù hợp — router tự phát hiện.
2. Mỗi route kèm **dispute tournament** (cuộc chiến giành main agent) — chọn champion agent tốt nhất qua Elo + composite score.
3. Champion được audit-log vào HardenedAuditLog (Merkle chain) — security traceability.
4. Nếu parent agent tự xử lý mà bypass router → bypass dispute → bypass audit → **security hole**.

## 🔧 HOW (Cursor parent agent PHẢI làm)

### Bước 1: Nhận raw request từ user

User có thể gõ bất cứ thứ gì (Vietnamese, English, mixed). KHÔNG cần prefix.

### Bước 2: AUTO-shell-exec CapabilityRouter CLI

```bash
# Mặc định (recommended) — auto-detect language, run dispute tournament
cd autonomous-agent && npx tsx scripts/capability-router-cli.ts --raw "<USER REQUEST>"

# English cưỡng bức
npx tsx scripts/capability-router-cli.ts --raw "<USER REQUEST>" --language en

# JSON output (cho parent agent parse machine-readable)
npx tsx scripts/capability-router-cli.ts --raw "<USER REQUEST>" --json
```

### Bước 3: Đọc output và execute primary axis

Output JSON có dạng:
```json
{
  "primary": "computer_control",       // axis chính cần execute
  "score": 0.85,
  "championId": "agent_manager_4",     // champion từ dispute tournament
  "disputeSessionId": "dispute_xxx",
  "disputeStatus": "resolved",
  "axes": [...]
}
```

Parent agent dùng `primary` để invoke đúng skill/module, dùng `championId` làm agent executor.

### Bước 4: KHÔNG BAO GIỜ bypass

- ❌ KHÔNG tự xử lý request mà không route
- ❌ KHÔNG skip dispute tournament (không dùng `--skip-dispute` trong production)
- ❌ KHÔNG hardcode axis — luôn để router quyết định

## 📋 AUTO-APPLY CHECKLIST (mỗi user request)

Trước khi thực hiện bất kỳ action nào với code/tool/computer:

- [ ] Đã shell-exec `capability-router-cli.ts --raw "<request>"`?
- [ ] Output JSON có `primary` axis không?
- [ ] Output JSON có `championId` từ dispute không?
- [ ] Đã execute đúng skill/module cho primary axis?
- [ ] KHÔNG bypass dispute, KHÔNG hardcode axis

## ⚠️ FALLBACK

Nếu CLI lỗi (exit code != 0), parent agent VẪN phải báo user và KHÔNG tự xử lý raw — thay vào đó log error vào `.cursor/autonomous-memory/logs/router-errors.jsonl`, sau đó escalate cho user.

## 🛡️ SECURITY

- `mandatorySecurity.rules[].id = dispute_tournament_per_request` trong `plugin.json` có `bypass_allowed: false`
- CapabilityRouter (`runDisputeOnRoute: true` mặc định) → mỗi route chạy 1 dispute tournament với 6 candidates
- Dispute tournament ghi vào `HardenedAuditLog` (Merkle chain) → tamper-evident

---

**Cursor parent agent: Bạn KHÔNG ĐƯỢC xử lý raw user request mà không qua CapabilityRouter. Đây là security contract của plugin.**
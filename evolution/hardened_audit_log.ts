/**
 * evolution/hardened_audit_log.ts — Merkle-chain audit log for evolution events
 *
 * Each entry includes hash of previous entry → tamper-evident chain.
 * No subprocesses. Uses built-in crypto (Node.js crypto module).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { AuditEntry } from './types';

/** Genesis hash for the first entry */
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class HardenedAuditLog {
  private entries: AuditEntry[] = [];
  private readonly logPath: string;
  private loaded = false;

  constructor(logPath?: string) {
    this.logPath = logPath ?? '';
    if (this.logPath) this.load();
  }

  /**
   * Append an entry to the chain. Validates previous hash matches.
   */
  append(
    agentId: string,
    action: string,
    details?: Record<string, unknown>
  ): AuditEntry {
    const prevHash = this.entries.length === 0
      ? GENESIS_HASH
      : this.entries[this.entries.length - 1]!.hash;

    const index = this.entries.length;
    const timestamp = Date.now();

    const content = JSON.stringify({ index, timestamp, agentId, action, prevHash, details });
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    const entry: AuditEntry = { index, timestamp, agentId, action, prevHash, hash, details };
    this.entries.push(entry);
    this.persist();
    return entry;
  }

  /**
   * Verify the chain integrity — returns true if all hashes match
   */
  verify(): { valid: boolean; brokenAt?: number } {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]!;
      if (entry.index !== i) return { valid: false, brokenAt: i };

      const expectedPrev = i === 0 ? GENESIS_HASH : this.entries[i - 1]!.hash;
      if (entry.prevHash !== expectedPrev) return { valid: false, brokenAt: i };

      // Recompute hash
      const content = JSON.stringify({
        index: entry.index,
        timestamp: entry.timestamp,
        agentId: entry.agentId,
        action: entry.action,
        prevHash: entry.prevHash,
        details: entry.details,
      });
      const computedHash = crypto.createHash('sha256').update(content).digest('hex');
      if (computedHash !== entry.hash) return { valid: false, brokenAt: i };
    }
    return { valid: true };
  }

  /**
   * Get all entries
   */
  getEntries(): ReadonlyArray<AuditEntry> {
    return [...this.entries];
  }

  /**
   * Get recent entries
   */
  getRecent(count: number): AuditEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Find entries by agent
   */
  getByAgent(agentId: string): AuditEntry[] {
    return this.entries.filter((e) => e.agentId === agentId);
  }

  size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.persist();
  }

  /**
   * Persist to JSONL file (best-effort)
   */
  private persist(): void {
    if (!this.logPath) return;
    try {
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const lines = this.entries.map((e) => JSON.stringify(e));
      fs.writeFileSync(this.logPath, lines.join('\n') + '\n', 'utf8');
    } catch {
      // best-effort
    }
  }

  private load(): void {
    if (!this.logPath || !fs.existsSync(this.logPath)) return;
    if (this.loaded) return;
    try {
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line) as AuditEntry;
        this.entries.push(entry);
      }
      this.loaded = true;
    } catch {
      // start fresh
    }
  }
}
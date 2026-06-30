/**
 * AI File Cleaner - Tự động dọn file thừa do AI tạo ra
 *
 * Quy tắc:
 * 1. CHẠY BẮT BUỘC trước khi kết thúc mỗi request
 * 2. Nếu có nội dung cần thiết → ghi vào AI_NOTES.md duy nhất
 * 3. Nếu hết cần thiết → xoá khỏi AI_NOTES.md
 *
 * Trước khi xoá file, phải kiểm tra nội dung có cần giữ không.
 * Nếu có → merge vào AI_NOTES.md (append/section) rồi mới xoá file gốc.
 */

import * as fs from 'fs';
import * as path from 'path';

export const AI_NOTES_FILENAME = 'AI_NOTES.md';

export interface CleanerOptions {
  /** Thư mục gốc để dọn (mặc định: cwd) */
  rootDir?: string;
  /** Có ghi log chi tiết không */
  verbose?: boolean;
  /** Whether to actually delete files or just dry-run */
  dryRun?: boolean;
  /** File extensions/names considered "AI-generated" (default: a common list) */
  aiPatterns?: RegExp[];
  /** Directories to scan (empty = scan whole rootDir except node_modules/.git/dist) */
  scanDirs?: string[];
  /** File names to protect absolutely (never delete) */
  protectedFiles?: string[];
}

export interface CleanupReport {
  scanned: number;
  flagged: number;
  deleted: number;
  mergedIntoNotes: number;
  keptAsIs: number;
  notesFile: string | null;
  details: CleanupItem[];
  durationMs: number;
}

export interface CleanupItem {
  file: string;
  action: 'deleted' | 'merged_into_notes' | 'kept';
  reason: string;
  size: number;
  contentPreview?: string;
}

const DEFAULT_PROTECTED = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'README.md',
  'LICENSE',
  'AGENTS.md',
  '.gitignore',
  '.env',
  '.env.example',
  AI_NOTES_FILENAME,
];

const DEFAULT_AI_PATTERNS: RegExp[] = [
  // File có tên bắt đầu bằng scratch/draft/temp/summary/todo (do AI tạo)
  // Cho phép theo sau là .ext, -suffix, _suffix, hoặc alphanumeric (vd: draft1.md, draft-final.md)
  /^(scratch|draft|notes?|tmp|temp|debug|recap|summary|cheatsheet|fix-notes?|todo|response|output|result|answer|ai[-_]response|plan|design|overview)(?:[-_.].*|[0-9].*)?$/i,
  // File "test-" (có dash) ở root — AI hay tạo test-*.ts nhanh
  /^test[-_][a-z0-9-]+\.(ts|js|md|txt)$/i,
];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.skill-cache',
  '.skill-store',
  '.agent-state',
  'tests',
  'test-output',
]);

export class AIFileCleaner {
  private rootDir: string;
  private verbose: boolean;
  private dryRun: boolean;
  private aiPatterns: RegExp[];
  private scanDirs: string[];
  private protectedFiles: Set<string>;
  private notesPath: string;

  constructor(opts: CleanerOptions = {}) {
    this.rootDir = opts.rootDir ?? process.cwd();
    this.verbose = opts.verbose ?? false;
    this.dryRun = opts.dryRun ?? false;
    this.aiPatterns = opts.aiPatterns ?? DEFAULT_AI_PATTERNS;
    this.scanDirs = opts.scanDirs ?? [];
    this.protectedFiles = new Set([
      ...DEFAULT_PROTECTED,
      ...(opts.protectedFiles ?? []),
    ]);
    this.notesPath = path.join(this.rootDir, AI_NOTES_FILENAME);
  }

  /**
   * Quét và dọn file thừa. Đây là hàm chính, gọi trước khi kết thúc request.
   */
  async run(): Promise<CleanupReport> {
    const start = Date.now();
    const details: CleanupItem[] = [];
    let scanned = 0;
    let deleted = 0;
    let merged = 0;
    let kept = 0;

    this.log(`[cleaner] Scanning ${this.rootDir} (dryRun=${this.dryRun})`);

    const candidates = this.collectCandidates();
    this.log(`[cleaner] Found ${candidates.length} candidate file(s)`);

    for (const file of candidates) {
      scanned++;
      const rel = path.relative(this.rootDir, file);

      // Wrap individual file processing to survive concurrent deletions (TOCTOU guard)
      try {
        if (!fs.existsSync(file)) {
          this.log(`[cleaner] SKIP → ${rel} (already gone)`);
          continue;
        }
        const stat = fs.statSync(file);
        const size = stat.size;
        const content = this.safeRead(file);
        const reason = this.classify(file);

        if (!reason) {
          kept++;
          continue;
        }

        const isContentWorthy = content !== null && content.trim().length >= 50;

        if (isContentWorthy) {
          if (!this.dryRun) {
            this.appendToNotes(rel, content!, reason);
          }
          merged++;
          details.push({
            file: rel,
            action: 'merged_into_notes',
            reason,
            size,
            contentPreview: content!.slice(0, 120),
          });
          if (!this.dryRun && fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
          this.log(`[cleaner] MERGED → ${rel}`);
        } else if (size === 0) {
          if (!this.dryRun && fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
          deleted++;
          details.push({
            file: rel,
            action: 'deleted',
            reason: reason + ' (empty)',
            size: 0,
          });
          this.log(`[cleaner] DELETED (empty) → ${rel}`);
        } else {
          if (!this.dryRun && fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
          deleted++;
          details.push({
            file: rel,
            action: 'deleted',
            reason,
            size,
          });
          this.log(`[cleaner] DELETED → ${rel}`);
        }
      } catch (fsErr: unknown) {
        const errMsg = fsErr instanceof Error ? fsErr.message : String(fsErr);
        this.log(`[cleaner] ERROR on ${rel}: ${errMsg}`);
      }
    }

    return {
      scanned,
      flagged: deleted + merged,
      deleted,
      mergedIntoNotes: merged,
      keptAsIs: kept,
      notesFile: fs.existsSync(this.notesPath) ? this.notesPath : null,
      details,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Thêm entry vào AI_NOTES.md (file duy nhất để ghi nhớ)
   */
  appendToNotes(file: string, content: string, reason: string): void {
    const section =
      `\n## Merged: ${file}\n` +
      `*Reason: ${reason}*\n` +
      `*At: ${new Date().toISOString()}*\n\n` +
      '```\n' +
      content.trim() +
      '\n```\n';

    if (!fs.existsSync(this.notesPath)) {
      const header =
        `# AI Notes\n\n` +
        `Auto-generated memory file. Content is merged from files AI created\n` +
        `before deletion. When no longer needed, remove the relevant section.\n\n` +
        `---\n`;
      fs.writeFileSync(this.notesPath, header + section, 'utf8');
    } else {
      fs.appendFileSync(this.notesPath, section, 'utf8');
    }
  }

  /**
   * Remove a section in AI_NOTES.md (when the user says "no longer needed")
   */
  removeNoteSection(keyword: string): boolean {
    if (!fs.existsSync(this.notesPath)) return false;
    const text = fs.readFileSync(this.notesPath, 'utf8');
    // Section starts with "## " and ends before the next "## " or EOF
    const lines = text.split('\n');
    const startIdx = lines.findIndex(
      (l) => l.startsWith('## ') && l.toLowerCase().includes(keyword.toLowerCase())
    );
    if (startIdx === -1) return false;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        endIdx = i;
        break;
      }
    }
    lines.splice(startIdx, endIdx - startIdx);
    fs.writeFileSync(this.notesPath, lines.join('\n'), 'utf8');
    return true;
  }

  /**
   * Phân loại file: trả về lý do nếu là file thừa, null nếu giữ
   */
  private classify(file: string): string | null {
    const base = path.basename(file);

    // Protected files
    if (this.protectedFiles.has(base)) return null;

    // File ẩn (trừ .gitignore, .env*)
    if (base.startsWith('.') && !['.gitignore', '.env', '.env.example'].includes(base)) {
      return null;
    }

    // Match theo pattern
    for (const pat of this.aiPatterns) {
      if (pat.test(base)) {
        return `Matches AI pattern: ${pat.source}`;
      }
    }

    return null;
  }

  /**
   * Thu thập tất cả file ứng viên để quét
   */
  private collectCandidates(): string[] {
    const roots = this.scanDirs.length > 0
      ? this.scanDirs.map((d) => path.join(this.rootDir, d))
      : [this.rootDir];

    const result: string[] = [];

    const visited = new Set<string>();

    const walk = (dir: string) => {
      const realDir = fs.realpathSync.native ? fs.realpathSync.native(dir) : dir;
      if (visited.has(realDir)) return;
      visited.add(realDir);

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') && IGNORE_DIRS.has(entry.name)) continue;
        if (IGNORE_DIRS.has(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          result.push(full);
        }
      }
    };

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      walk(root);
    }

    return result;
  }

  private safeRead(file: string): string | null {
    try {
      const buf = fs.readFileSync(file, 'utf8');
      // Bỏ file binary
      if (buf.includes('\0')) return null;
      return buf;
    } catch {
      return null;
    }
  }

  private log(msg: string): void {
    if (this.verbose) {
      console.log(msg);
    }
  }
}

/**
 * Helper: gọi nhanh trước khi kết thúc request
 */
export async function cleanupAIArtifacts(opts: CleanerOptions = {}): Promise<CleanupReport> {
  const cleaner = new AIFileCleaner(opts);
  return cleaner.run();
}

/**
 * Helper: remove one section in AI_NOTES.md when the user says "no longer needed"
 */
export function removeNote(keyword: string, rootDir = process.cwd()): boolean {
  const cleaner = new AIFileCleaner({ rootDir });
  return cleaner.removeNoteSection(keyword);
}
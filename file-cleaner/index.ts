/**
 * File Cleaner module - Tự động dọn file thừa do AI tạo ra
 *
 * Public API:
 *   - AIFileCleaner: class chính
 *   - cleanupAIArtifacts(): gọi nhanh
 *   - removeNote(): xoá section trong AI_NOTES.md
 *   - AI_NOTES_FILENAME: tên file ghi nhớ
 */

export {
  AIFileCleaner,
  cleanupAIArtifacts,
  removeNote,
  AI_NOTES_FILENAME,
} from './ai_file_cleaner';

export type {
  CleanerOptions,
  CleanupReport,
  CleanupItem,
} from './ai_file_cleaner';
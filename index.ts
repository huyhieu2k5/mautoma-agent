/**
 * mautoma-agent — main entry point for the Cursor plugin runtime.
 *
 * Re-exports the public API for embedding the capability router,
 * auto-apply engine, and AI file cleaner. Hooks and the session-start
 * driver are loaded directly from `scripts/` and `hooks/` — they
 * are not part of the programmatic surface.
 */

export {
  AutoApplyEngine,
  autoApply,
  createAutoApplyEngine,
} from './auto-apply';

export type {
  ApplyResult,
  ApplyStep,
  AutoApplyConfig,
  AutoApplyContext,
  CapabilityAxis,
  IntentMatch,
} from './auto-apply';

export {
  AIFileCleaner,
  AI_NOTES_FILENAME,
  cleanupAIArtifacts,
  removeNote,
} from './file-cleaner';

export type {
  CleanerOptions,
  CleanupItem,
  CleanupReport,
} from './file-cleaner';

export const VERSION = '1.0.1';
export const PLUGIN_NAME = 'mautoma-agent';

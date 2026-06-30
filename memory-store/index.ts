/**
 * memory-store/index.ts — Public API surface.
 *
 * Exports everything from the full implementation.
 * This replaces the previous stub (which always returned empty arrays).
 */

// Persistence layer
export type { SessionTurn, SessionMeta, MemoryIndex } from './persistence';
export {
  loadIndex,
  saveIndex,
  upsertSessionMeta,
  findSessionMeta,
  appendTurn,
  readSessionTurns,
  readAllSessions,
  extractOriginalIntent,
  summarizeIntent,
  computeWorkspaceKey,
  resolveMemoryRoot,
  resolveSessionsDir,
  resolveIndexPath,
  buildSessionFilename,
  parseSessionFilename,
  MEMORY_DIR,
  SESSIONS_DIR,
  INDEX_FILE,
  TAGS_DIR,
} from './persistence';

// Chunker layer
export type { Chunk, ChunkTag } from './context_chunker';
export {
  chunkConversation,
  retrieveRelevantChunks,
  STOP_WORDS,
} from './context_chunker';

// Manager layer
export type {
  MemoryManagerConfig,
  SessionHandle,
  RetrievedContext,
  InjectionBlock,
  MemoryEntry,
} from './memory_manager';
export {
  startSession,
  endSession,
  abandonSession,
  addTurn,
  retrieveContext,
  buildInjectionBlock,
  listSessions,
  isMemoryStoreInitialized,
  createMemoryManager,
  getMemoryManager,
} from './memory_manager';

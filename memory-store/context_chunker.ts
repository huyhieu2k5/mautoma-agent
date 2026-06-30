/**
 * context_chunker.ts — Split a conversation into retrievable memory chunks.
 *
 * Strategy:
 *  1. Chunk by "task boundary" — detect meaningful transitions in conversation flow.
 *  2. Assign each chunk a semantic tag (e.g. "task-setup", "code-review", "bug-fix").
 *  3. Index chunks with importance scores so retrieval can prioritize.
 *
 * A chunk is "retrievable" when it represents a self-contained unit of work
 * or context that a future session can benefit from.
 */

import type { SessionTurn } from './persistence';

export interface Chunk {
  id: string; // unique within session
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tags: ChunkTag[];
  importance: number; // 0-1, higher = more memorable
  timestamp: string;
  /** If true, this chunk carries the session's original intent */
  isOriginalIntent: boolean;
  /** If true, this chunk captures a concluded decision or outcome */
  isConclusion: boolean;
}

export type ChunkTag =
  | 'task-setup'       // user sets up requirements / context
  | 'task-execution'   // agent implements / executes
  | 'task-review'      // user reviews or critiques
  | 'bug-fix'          // debugging / error recovery
  | 'architecture'     // design / structure decisions
  | 'clarification'    // Q&A between user and agent
  | 'configuration'   // settings / config changes
  | 'command-execution'// shell commands / results
  | 'decision'          // significant choice made
  | 'conclusion'       // task completed / result summary
  | 'general';          // everything else

const TAG_PATTERNS: Array<{ tag: ChunkTag; userPattern: RegExp; assistantPattern: RegExp }> = [
  {
    tag: 'task-setup',
    userPattern: /^(tôi muốn|bạn ơi|làm ơn|giúp tôi|cho tôi|build|create|make|implement|develop|tạo|xây dựng|làm|hãy|viet|viết)\b/i,
    assistantPattern: /^(đã|tôi sẽ|let me|here is|i will|i've created|i'll implement)/i,
  },
  {
    tag: 'bug-fix',
    userPattern: /(lỗi|bug|error|fix|sửa|not work|không chạy|không hoạt động|broken|crash|failed|thrown)/i,
    assistantPattern: /(fixed|patched|bug fix|root cause|solution|hắn đã|đã sửa|error:|exception:)/i,
  },
  {
    tag: 'architecture',
    userPattern: /(kiến trúc|architecture|design|thiết kế|structure|cấu trúc|refactor)/i,
    assistantPattern: /(class |interface |module |layer |architecture|design pattern|factory|singleton|observer)/i,
  },
  {
    tag: 'command-execution',
    userPattern: /(chạy|run |npm |npx |git |node |python |cargo |docker |build |test )/i,
    assistantPattern: /(✅|❌|✓|✗|\$|output:|result:|running|executed|installed)/i,
  },
  {
    tag: 'task-review',
    userPattern: /(kiểm tra|check|review|xem lại|verify|validate|test thử|chạy thử|debug)/i,
    assistantPattern: /(tested|verified|reviewed|validated|all green|passed|✅|coverage:)/i,
  },
  {
    tag: 'configuration',
    userPattern: /(config|cài đặt|settings| thiết lập|setup|install|thêm plugin)/i,
    assistantPattern: /(config|configured|settings|installed|dependencies|package\.json|tsconfig)/i,
  },
  {
    tag: 'decision',
    userPattern: /(chọn|dùng|dùng cái nào|which one|tại sao|why|how should)/i,
    assistantPattern: /(i recommend|i suggest|choosing|selected|decided|going with|using)/i,
  },
  {
    tag: 'clarification',
    userPattern: /(gì|what is|what does|what are|nghĩa là|giải thích|explain|tại sao|why|how)/i,
    assistantPattern: /(means|basically|essentially|nói cách khác|that means|in other words)/i,
  },
];

function detectTag(turn: SessionTurn, index: number, total: number): ChunkTag {
  for (const { tag, userPattern, assistantPattern } of TAG_PATTERNS) {
    if (turn.role === 'user' && userPattern.test(turn.content)) return tag;
    if (turn.role === 'assistant' && assistantPattern.test(turn.content)) return tag;
  }
  return 'general';
}

function computeImportance(turn: SessionTurn, index: number, total: number): number {
  const base = 0.3;
  let score = base;

  // First user message is the most important
  if (index === 0 && turn.role === 'user') score = 1.0;

  // Long messages are more substantive
  if (turn.content.length > 2000) score += 0.2;
  else if (turn.content.length > 500) score += 0.1;

  // Task-setup and bug-fix are high-value
  const tag = detectTag(turn, index, total);
  if (tag === 'task-setup' || tag === 'bug-fix' || tag === 'architecture') score += 0.3;

  // Conclusions are important
  if (/đã xong|hoàn thành|done|completed|finished|✅/.test(turn.content)) {
    score += 0.2;
  }

  // Last few turns are important (recency bias)
  if (index >= total - 3) score += 0.1;

  return Math.min(score, 1.0);
}

/**
 * Chunk a session's turns into retrievable units.
 *
 * Grouping strategy:
 *  - If a user message is short (<200 chars), pair it with the next assistant response.
 *  - If a user message is long (>=200 chars), keep it as its own chunk.
 *  - System messages each get their own chunk.
 */
export function chunkConversation(sessionId: string, turns: SessionTurn[]): Chunk[] {
  if (turns.length === 0) return [];

  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const tag = detectTag(turn, i, turns.length);
    const importance = computeImportance(turn, i, turns.length);
    const isOriginalIntent = i === 0 && turn.role === 'user';
    const isConclusion =
      /đã xong|hoàn thành|done|completed|finished|✅|all set|tất cả xong/i.test(
        turn.content
      );

    // Short user messages get paired with next assistant turn
    if (
      turn.role === 'user' &&
      turn.content.length < 200 &&
      i + 1 < turns.length &&
      turns[i + 1].role === 'assistant'
    ) {
      const userChunk: Chunk = {
        id: `${sessionId}__chunk_${chunkIndex++}`,
        sessionId,
        role: 'user',
        content: turn.content,
        tags: [tag, 'general'],
        importance,
        timestamp: turn.timestamp,
        isOriginalIntent,
        isConclusion,
      };
      chunks.push(userChunk);

      // Paired assistant chunk
      const assistant = turns[i + 1];
      const aTag = detectTag(assistant, i + 1, turns.length);
      const aImportance = computeImportance(assistant, i + 1, turns.length);
      const aConclusion =
        /đã xong|hoàn thành|done|completed|finished|✅|all set/i.test(assistant.content);

      chunks.push({
        id: `${sessionId}__chunk_${chunkIndex++}`,
        sessionId,
        role: 'assistant',
        content: assistant.content,
        tags: [aTag, 'task-execution'],
        importance: aImportance,
        timestamp: assistant.timestamp,
        isOriginalIntent: false,
        isConclusion: aConclusion,
      });
      i++; // skip assistant
    } else {
      chunks.push({
        id: `${sessionId}__chunk_${chunkIndex++}`,
        sessionId,
        role: turn.role,
        content: turn.content,
        tags: [tag],
        importance,
        timestamp: turn.timestamp,
        isOriginalIntent,
        isConclusion,
      });
    }
  }

  return chunks;
}

/**
 * Filter chunks relevant to a new user request using keyword overlap.
 * Returns chunks sorted by relevance (descending).
 */
export function retrieveRelevantChunks(
  chunks: Chunk[],
  request: string,
  options: { maxChunks?: number; minImportance?: number } = {}
): Chunk[] {
  const { maxChunks = 10, minImportance = 0.1 } = options;

  const keywords = request
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .filter((w) => !STOP_WORDS.has(w));

  const scored = chunks
    .filter((c) => c.importance >= minImportance)
    .map((chunk) => {
      const content = chunk.content.toLowerCase();
      const tagOverlap = chunk.tags.some((t) => keywords.some((k) => t.includes(k) || k.includes(t)));
      const keywordOverlap = keywords.filter((k) => content.includes(k)).length;
      const score = chunk.importance * 0.4 + keywordOverlap * 0.3 + (tagOverlap ? 0.3 : 0);
      return { chunk, score };
    })
    .filter((s) => s.score > 0);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map((s) => s.chunk);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'và', 'của', 'cho', 'với', 'trong', 'để', 'là', 'đã', 'được', 'tôi',
  'bạn', 'có', 'không', 'này', 'khi', 'một', 'những', 'như', 'các',
]);

export { STOP_WORDS };

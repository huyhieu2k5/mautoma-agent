/**
 * Self-RAG — Retrieval-Augmented Verification
 *
 * Strategy:
 *  - Retrieve relevant context from memory (past decisions, similar artifacts)
 *  - Use retrieved context to ground the verification decision
 *  - This prevents the verifier from "hallucinating" by anchoring to real artifacts
 *
 * The RAG pipeline:
 *  1. Index: Store verification results with their context (embedding placeholder)
 *  2. Retrieve: Find similar past verifications
 *  3. Ground: Use retrieved context to inform current decision
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    type: 'verification_result' | 'code_snippet' | 'decision_log' | 'artifact';
    timestamp: number;
    tags: string[];
    verdict?: 'pass' | 'warn' | 'fail';
    score?: number;
  };
}

export interface RetrievalQuery {
  text: string;
  tags?: string[];
  type?: RAGDocument['metadata']['type'];
  limit?: number;
}

export interface RetrievedDocument extends RAGDocument {
  relevanceScore: number;
}

export interface SelfRAGResult {
  verdict: 'pass' | 'warn' | 'fail';
  confidence: number;
  retrievedDocs: RetrievedDocument[];
  groundedFindings: string[];
  retrievalTimeMs: number;
}

export interface SelfRAGConfig {
  indexPath?: string;
  maxRetrieval?: number;
  similarityThreshold?: number;
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<Omit<SelfRAGConfig, 'indexPath'>> & { indexPath?: string } = {
  maxRetrieval: 5,
  similarityThreshold: 0.3,
  verbose: false,
  indexPath: undefined,  // resolved dynamically
};

/**
 * Resolve the RAG index path
 */
function resolveIndexPath(config: SelfRAGConfig): string {
  if (config.indexPath) return config.indexPath;
  return path.join(process.cwd(), '.mautoma', 'rag-index.jsonl');
}

/**
 * Load the RAG index from disk
 */
function loadIndex(indexPath: string): RAGDocument[] {
  try {
    if (!fs.existsSync(indexPath)) return [];
    const lines = fs.readFileSync(indexPath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.map((l) => JSON.parse(l) as RAGDocument);
  } catch {
    return [];
  }
}

/**
 * Save a document to the RAG index
 */
function saveDocument(indexPath: string, doc: RAGDocument): void {
  try {
    const dir = path.dirname(indexPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(indexPath, JSON.stringify(doc) + '\n', 'utf8');
  } catch {
    // Silently fail if we can't write
  }
}

/**
 * Compute a simple relevance score between query and document
 * Uses keyword overlap + tag matching (simplified embedding-free similarity)
 */
function computeRelevance(query: RetrievalQuery, doc: RAGDocument): number {
  let score = 0;

  // Text overlap: query words in document content
  const queryWords = query.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const docContent = doc.content.toLowerCase();
  const contentMatches = queryWords.filter((w) => docContent.includes(w)).length;
  const contentScore = queryWords.length > 0 ? contentMatches / queryWords.length : 0;
  score += contentScore * 0.6;

  // Tag match
  if (query.tags && query.tags.length > 0) {
    const tagMatches = query.tags.filter((t) => doc.metadata.tags.includes(t)).length;
    const tagScore = query.tags.length > 0 ? tagMatches / query.tags.length : 0;
    score += tagScore * 0.3;
  }

  // Type match
  if (query.type && query.type === doc.metadata.type) {
    score += 0.1;
  }

  return score;
}

/**
 * Store a verification result in the RAG index
 */
export function indexVerificationResult(
  result: { ok: boolean; checks: Array<{ name: string; passed: boolean }> },
  config: SelfRAGConfig = {}
): void {
  const indexPath = resolveIndexPath(config);
  const verdict = result.ok ? 'pass' : 'fail';

  const doc: RAGDocument = {
    id: `rag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    content: result.checks.map((c) => `${c.name}: ${c.passed ? 'pass' : 'fail'}`).join('; '),
    metadata: {
      type: 'verification_result',
      timestamp: Date.now(),
      verdict,
      score: result.ok ? 1 : 0,
      tags: result.ok
        ? ['verification', 'pass', 'all-checks']
        : ['verification', 'fail', ...result.checks.filter((c) => !c.passed).map((c) => `fail:${c.name}`)],
    },
  };

  saveDocument(indexPath, doc);
}

/**
 * Retrieve relevant past verification results
 */
export function retrieve(
  query: RetrievalQuery,
  config: SelfRAGConfig = {}
): RetrievedDocument[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const indexPath = resolveIndexPath(cfg);
  const docs = loadIndex(indexPath);

  if (docs.length === 0) return [];

  const scored = docs
    .map((doc) => ({
      doc,
      relevance: computeRelevance(query, doc),
    }))
    .filter((s) => s.relevance >= cfg.similarityThreshold)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, cfg.maxRetrieval);

  return scored.map((s) => ({
    ...s.doc,
    relevanceScore: s.relevance,
  }));
}

/**
 * Main Self-RAG verification function
 *
 * Given a verification result, retrieve similar past results from memory,
 * then ground the current decision in retrieved context.
 */
export function selfRAG(
  verificationResult: { ok: boolean; checks: Array<{ name: string; passed: boolean; message?: string }> },
  config: SelfRAGConfig = {}
): SelfRAGResult {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Build query from verification result
  const query: RetrievalQuery = {
    text: verificationResult.checks.map((c) => c.name).join(' '),
    type: 'verification_result',
    limit: cfg.maxRetrieval,
  };

  // Retrieve similar past results
  const retrieved = retrieve(query, cfg);

  // Index this result for future queries
  indexVerificationResult(verificationResult, cfg);

  // Ground findings from retrieved documents
  const groundedFindings: string[] = [];

  if (retrieved.length > 0) {
    cfg.verbose && console.log(`[self-rag] Retrieved ${retrieved.length} similar past results`);

    // If we have past "fail" results for the same checks, be more careful
    const pastFails = retrieved.filter((d) => d.metadata.verdict === 'fail');
    if (pastFails.length > 0) {
      groundedFindings.push(`⚠️ ${pastFails.length} past failure(s) for similar verification`);
    }

    // If we have past "pass" results, increase confidence
    const pastPasses = retrieved.filter((d) => d.metadata.verdict === 'pass');
    if (pastPasses.length > retrieved.length / 2) {
      groundedFindings.push(`✅ ${pastPasses.length} similar verification(s) previously passed`);
    }
  }

  // Compute confidence based on retrieved context
  let confidence = verificationResult.ok ? 0.8 : 0.6;
  if (retrieved.length > 0) {
    const avgRelevance = retrieved.reduce((s, d) => s + d.relevanceScore, 0) / retrieved.length;
    confidence = Math.min(0.95, confidence + avgRelevance * 0.15);
  }

  const verdict: 'pass' | 'warn' | 'fail' = verificationResult.ok
    ? confidence >= 0.7 ? 'pass' : 'warn'
    : 'fail';

  return {
    verdict,
    confidence,
    retrievedDocs: retrieved,
    groundedFindings,
    retrievalTimeMs: Date.now() - startTime,
  };
}

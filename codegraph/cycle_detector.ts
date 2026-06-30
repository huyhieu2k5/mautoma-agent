/**
 * codegraph/cycle_detector.ts — DFS-based cycle detection on import graph
 *
 * Pure-JS. Uses Tarjan-like strongly-connected-components algorithm
 * to find all cycles in O(V+E) time.
 */

import type { ImportGraph, GraphCycle } from './types';

/**
 * Find all cycles in the import graph using SCC detection.
 * SCCs with size > 1 are guaranteed to contain cycles.
 * Single-node SCCs are reported only if they have a self-loop.
 */
export function findCycles(graph: ImportGraph): GraphCycle[] {
  const adj = new Map<string, string[]>();

  // Build adjacency list
  for (const node of graph.nodes.keys()) {
    adj.set(node, []);
  }
  for (const edge of graph.edges) {
    const list = adj.get(edge.from) ?? [];
    list.push(edge.resolvedTo ?? edge.to);
    adj.set(edge.from, list);
  }

  // Tarjan's SCC
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const v of adj.keys()) {
    if (!indices.has(v)) strongconnect(v);
  }

  // Convert SCCs to cycles
  const cycles: GraphCycle[] = [];
  for (const scc of sccs) {
    if (scc.length > 1) {
      cycles.push({
        path: scc,
        length: scc.length,
      });
    } else if (scc.length === 1) {
      const node = scc[0];
      const outs = adj.get(node) ?? [];
      if (outs.includes(node)) {
        cycles.push({ path: [node], length: 1 });
      }
    }
  }

  return cycles;
}

/**
 * Find files that have no imports and are not imported by anyone (orphans)
 */
export function findOrphans(graph: ImportGraph): string[] {
  const imported = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.resolvedTo) imported.add(edge.resolvedTo);
  }

  const orphans: string[] = [];
  for (const [filePath, summary] of graph.nodes.entries()) {
    const hasOutbound = summary.imports.length > 0;
    const hasInbound = imported.has(filePath);
    if (!hasOutbound && !hasInbound) {
      orphans.push(filePath);
    }
  }
  return orphans;
}

/**
 * Top-N most-depended-on files
 */
export function mostDependedOn(graph: ImportGraph, topN = 5): Array<{ file: string; inbound: number }> {
  const inbound = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.resolvedTo) {
      inbound.set(edge.resolvedTo, (inbound.get(edge.resolvedTo) ?? 0) + 1);
    }
  }
  return Array.from(inbound.entries())
    .map(([file, count]) => ({ file, inbound: count }))
    .sort((a, b) => b.inbound - a.inbound)
    .slice(0, topN);
}

/**
 * Top-N files with most outgoing imports
 */
export function mostOutbound(graph: ImportGraph, topN = 5): Array<{ file: string; outbound: number }> {
  return Array.from(graph.nodes.entries())
    .map(([file, summary]) => ({ file, outbound: summary.imports.length }))
    .sort((a, b) => b.outbound - a.outbound)
    .slice(0, topN);
}
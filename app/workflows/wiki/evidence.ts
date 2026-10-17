// Wiki evidence integrity is independent of storage history envelopes and migration review files.
import type { NodeAddress, NodeVersion } from '@/vault/nodes/model.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import type { TextSelection } from './citations.ts';
import { citation } from './records.ts';

export interface EvidenceEndpoint {
  readonly address: NodeAddress;
  readonly selection: TextSelection;
}
export interface EvidencePair {
  readonly claim: EvidenceEndpoint;
  readonly passage: EvidenceEndpoint;
}

/** Normalize inline selections to their text block. Identity survives historical snapshots:
 * an older copy of the same summary is not independent evidence. */
export function auditEvidence(
  snapshot: (sequence: number) => NodeSnapshot,
  pairs: readonly EvidencePair[],
) {
  const endpoint = ({ address, selection }: EvidenceEndpoint) => {
    const view = snapshot(selection.sequence);
    let node = view.resolve(address);
    if (!node?.data) throw new Error('Evidence endpoint is unavailable');
    let block = node.key.node;
    const seen = new Set<string>();
    while (['run', 'link'].includes(String(node.data?.kind)) && node.placement) {
      if (seen.has(node.key.node)) break;
      seen.add(node.key.node);
      const parent: NodeVersion | undefined = view.get(node.placement.parent);
      if (!parent?.data) break;
      node = parent;
      block = node.key.node;
    }
    seen.clear();
    while (node.placement && node.data?.kind !== 'page') {
      if (seen.has(node.key.node)) break;
      seen.add(node.key.node);
      const parent: NodeVersion | undefined = view.get(node.placement.parent);
      if (!parent?.data) break;
      node = parent;
    }
    return { block, page: node.data?.kind === 'page' ? node.key.node : undefined };
  };
  const edges = pairs.map((pair) => ({
    claim: endpoint(pair.claim),
    passage: endpoint(pair.passage),
  }));
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    const targets = graph.get(edge.claim.block) ?? new Set<string>();
    targets.add(edge.passage.block);
    graph.set(edge.claim.block, targets);
  }
  const reaches = (start: string, target: string) => {
    const pending = [start];
    const visited = new Set<string>();
    while (pending.length) {
      const node = pending.pop()!;
      if (node === target) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      pending.push(...(graph.get(node) ?? []));
    }
    return false;
  };
  return {
    wikiSources: edges.flatMap((edge, index) => (edge.passage.page ? [index] : [])),
    self: edges.flatMap((edge, index) =>
      edge.claim.block === edge.passage.block ||
      (edge.claim.page && edge.claim.page === edge.passage.page)
        ? [index]
        : [],
    ),
    circular: edges.flatMap((edge, index) =>
      reaches(edge.passage.block, edge.claim.block) ? [index] : [],
    ),
  };
}

/** Include every selected statement Citation, even one beneath a deleted container.
 * Snapshot containment traversal alone cannot enumerate those retained live records. */
export function validateEvidence(
  view: NodeSnapshot,
  snapshot: (sequence: number) => NodeSnapshot,
  pairs: readonly EvidencePair[],
  existingCitations: readonly NodeVersion[],
) {
  const existing: EvidencePair[] = [];
  for (const node of existingCitations) {
    if (
      view.get(node.key.node)?.key.transaction !== node.key.transaction ||
      node.data?.kind !== 'cite' ||
      !node.connection ||
      !node.data.claim ||
      !node.data.passage
    )
      continue;
    const data = citation.parse(node.data);
    if (!('claim' in data)) continue;
    existing.push({
      claim: { address: node.connection.source, selection: data.claim },
      passage: { address: node.connection.target, selection: data.passage },
    });
  }
  const audit = auditEvidence(snapshot, [...existing, ...pairs]);
  if (audit.wikiSources.length)
    throw new Error('Wiki content is distilled material, not a citation source');
  if (audit.self.length) throw new Error('Evidence cannot cite its own page or text block');
  if (audit.circular.length) throw new Error('Circular statement evidence requires review');
}

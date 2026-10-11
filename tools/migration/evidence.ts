// Evidence review integrity shared by packet compilation and append-only enrichment.
import { snapshotOf } from '../../app/vault/nodes/history.ts';
import type { NodeAddress, NodeVersion } from '../../app/vault/nodes/model.ts';
import type { NodeRecord } from '../../app/vault/nodes/validation.ts';
import type { TextSelection } from '../../app/vault/records/citations.ts';
import { citation } from '../../app/vault/records/wiki.ts';

interface EvidenceEndpoint {
  address: NodeAddress;
  selection: TextSelection;
}
export interface EvidencePair {
  claim: EvidenceEndpoint;
  passage: EvidenceEndpoint;
}

/** Normalize inline selections to their text block, so run → paragraph → run cannot hide a cycle.
 * Keep identities across snapshots: an older copy of the same summary is not independent evidence. */
export function auditEvidence(records: readonly NodeRecord[], pairs: readonly EvidencePair[]) {
  const snapshots = new Map<number, ReturnType<typeof snapshotOf>>();
  const endpoint = ({ address, selection }: EvidenceEndpoint) => {
    let view = snapshots.get(selection.sequence);
    if (!view) {
      view = snapshotOf(records, selection.sequence);
      snapshots.set(selection.sequence, view);
    }
    let node = view.resolve(address);
    if (!node?.data) throw new Error('Evidence endpoint is unavailable');
    let block = node.key.node;
    while (['run', 'link'].includes(String(node.data?.kind)) && node.placement) {
      const parent: NodeVersion | undefined = view.get(node.placement.parent);
      if (!parent?.data) break;
      node = parent;
      block = node.key.node;
    }
    while (node.placement && node.data?.kind !== 'page') {
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

export function validateEvidence(records: readonly NodeRecord[], pairs: readonly EvidencePair[]) {
  // Include existing statement citations so later enrichment cannot close a previously open chain.
  const view = snapshotOf(records);
  const existing: EvidencePair[] = [];
  for (const record of records)
    for (const node of record.versions) {
      if (
        view.get(node.key.node)?.key.transaction !== node.key.transaction ||
        node.data?.kind !== 'cite' ||
        !node.connection ||
        !node.data.claim ||
        !node.data.passage
      )
        continue;
      // These records share the canonical selection schema with newly reviewed pairs.
      const data = citation.parse(node.data);
      if (!('claim' in data)) continue;
      const { claim, passage } = data;
      existing.push({
        claim: { address: node.connection.source, selection: claim },
        passage: { address: node.connection.target, selection: passage },
      });
    }
  const audit = auditEvidence(records, [...existing, ...pairs]);
  if (audit.wikiSources.length)
    throw new Error('Wiki content is distilled material, not a citation source');
  if (audit.self.length) throw new Error('Evidence cannot cite its own page or text block');
  if (audit.circular.length) throw new Error('Circular statement evidence requires review');
}

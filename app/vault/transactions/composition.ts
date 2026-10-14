import type { NodeChange, NodeCommit } from '../nodes/store.ts';
import { NodePublicationRejected } from '../nodes/history.ts';

type Part = Pick<NodeCommit, 'changes' | 'expectedReads'>;

/** Composition retains every expectation; disagreement is never resolved by object spread. */
export function composeChanges(...parts: readonly Part[]): Part {
  const changes: NodeChange[] = [];
  const changed = new Set<string>();
  const expectations = new Map<string, string | null>();
  const reads = new Map<string, string | null>();
  const expect = (node: string, transaction: string | null) => {
    if (expectations.has(node) && expectations.get(node) !== transaction)
      throw new NodePublicationRejected(`Contradictory read expectations for ${node}`);
    expectations.set(node, transaction);
  };
  for (const part of parts) {
    for (const [node, transaction] of Object.entries(part.expectedReads ?? {})) {
      expect(node, transaction);
      reads.set(node, transaction);
    }
    for (const change of part.changes) {
      if (changed.has(change.node))
        throw new NodePublicationRejected(`Duplicate changed Node: ${change.node}`);
      changed.add(change.node);
      expect(change.node, change.expected);
      changes.push(change);
    }
  }
  return { changes, ...(reads.size ? { expectedReads: Object.fromEntries(reads) } : {}) };
}

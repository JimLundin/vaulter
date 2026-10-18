import type { HistoricalReference } from '@/core/store/index.ts';

export interface RedirectEdge {
  source: HistoricalReference;
  target: HistoricalReference;
}

/** Snapshot addresses differ while the retained identity remains the same. */
export function sameAddressIdentity(a: HistoricalReference, b: HistoricalReference): boolean {
  return (
    a.scope === b.scope && a.journal === b.journal && a.type === b.type && a.entity === b.entity
  );
}

export function validateRedirects(edges: readonly RedirectEdge[]): void {
  for (const edge of edges) {
    if (edge.source.type !== edge.target.type)
      throw new Error('Identity redirects require records of the same type');
    if (edge.source.type === '@transaction' || edge.source.type === 'identity.redirect')
      throw new Error('Transactions and identity redirects cannot be merged');
    if (sameAddressIdentity(edge.source, edge.target))
      throw new Error('An identity cannot redirect to itself');
    if (edges.filter((other) => sameAddressIdentity(edge.source, other.source)).length > 1)
      throw new Error('Ambiguous identity redirects');
    const visited: HistoricalReference[] = [edge.source];
    let { target } = edge;
    for (;;) {
      if (visited.some((address) => sameAddressIdentity(address, target)))
        throw new Error('Identity redirect cycle');
      visited.push(target);
      const next = edges.find((other) => sameAddressIdentity(other.source, target));
      if (!next) break;
      ({ target } = next);
    }
  }
}

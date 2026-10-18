import type { HistoricalReference } from '@/core/store/index.ts';
import type { IdentityDatabase } from './records.ts';
import { sameAddressIdentity, validateRedirects } from './validation.ts';

/** Evidence always resolves the original identity and exact state, ignoring all redirects. */
export async function resolveHistoricalIdentity(
  db: IdentityDatabase,
  address: HistoricalReference,
) {
  const resolved = await db.history.resolve(address);
  const record = await db.history.inspect(resolved.transaction, resolved.entity);
  return { ...resolved, record };
}

/** Current callers follow canonical correspondence, then read the survivor's current state. */
export async function resolveCurrentIdentity(db: IdentityDatabase, address: HistoricalReference) {
  await db.history.resolve(address); // Validate journal, scope, type and accepted evidence anchor.
  const snapshot = await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  });
  if (!snapshot) throw new Error('Identity state is unavailable');
  const edges = await db.at(snapshot).entities.identityRedirects.query({
    select: { source: true, target: true },
    where: { available: { eq: true } },
    limit: null, // Resolve all active correspondence in this one accepted snapshot.
  });
  validateRedirects(edges);
  const redirects: (typeof edges)[number][] = [];
  let canonical = address;
  for (;;) {
    const edge = edges.find((candidate) => sameAddressIdentity(candidate.source, canonical));
    if (!edge) break;
    redirects.push(edge);
    canonical = edge.target;
  }
  const { entity } = await db.history.resolve(canonical);
  const record = await db.history.inspect(snapshot, entity);
  return {
    entity,
    snapshot,
    canonical,
    redirects,
    record,
    available: record !== undefined && record.values.available !== false,
  };
}

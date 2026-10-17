import { sameEntity, type HistoricalReference, type TransactionRef } from '@/vault/eav/index.ts';
import { parseCoordinates } from './coordinates.ts';
import type { MapDatabase } from './schema.ts';

export interface CoordinateQuery {
  subject?: HistoricalReference;
  snapshot?: TransactionRef;
}

/** Pin accepted state; subject filtering matches record identity across source snapshots. */
export async function readCoordinates(db: MapDatabase, query: CoordinateQuery = {}) {
  const subject = query.subject ? await db.history.resolve(query.subject) : undefined;
  const snapshot =
    query.snapshot ??
    (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }));
  if (!snapshot) return [];
  const records = await db.at(snapshot).entities.mapCoordinates.query({
    limit: null, // Coordinate subject matching happens after historical identity resolution.
    select: { subject: true, coordinates: true },
    where: { available: { eq: true } },
  });
  const matches = await Promise.all(
    records.map(async (record) => {
      if (subject) {
        const target = await db.history.resolve(record.subject);
        if (!sameEntity(subject.entity, target.entity)) return [];
      }
      return [{ ...record, coordinates: parseCoordinates(record.coordinates) }];
    }),
  );
  return matches.flat();
}

export type CoordinateRecord = Awaited<ReturnType<typeof readCoordinates>>[number];

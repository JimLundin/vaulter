import { sameEntity, type HistoricalReference, type TransactionRef } from '@/core/store/index.ts';
import type { ObservationDatabase, ObservationRef } from './records.ts';
import { parseObservation, type ObservationValue } from './values.ts';

export interface ObservationQuery {
  snapshot?: TransactionRef;
  subject?: ObservationValue['subject'];
  context?: HistoricalReference;
  includeUnavailable?: boolean;
}
export interface ObservationRecord {
  ref: ObservationRef;
  value: ObservationValue;
  available: boolean;
  context?: HistoricalReference;
  provenance?: HistoricalReference;
}
export async function readObservations(
  db: ObservationDatabase,
  query: ObservationQuery = {},
): Promise<ObservationRecord[]> {
  const context = query.context ? await db.history.resolve(query.context) : undefined;
  const snapshot =
    query.snapshot ??
    (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }));
  if (!snapshot) return [];
  const records = await db.at(snapshot).entities.observations.query({
    limit: null, // Domain filtering follows validated JSON and historical context resolution.
    select: { value: true, context: true, provenance: true, available: true },
    where: query.includeUnavailable ? undefined : { available: { eq: true } },
  });
  const matches = await Promise.all(
    records.map(async (record) => {
      const value = parseObservation(record.value);
      if (query.subject && value.subject !== query.subject) return [];
      if (context) {
        if (!record.context) return [];
        const target = await db.history.resolve(record.context);
        if (!sameEntity(context.entity, target.entity)) return [];
      }
      return [
        {
          ref: record,
          value,
          available: record.available,
          context: record.context,
          provenance: record.provenance,
        },
      ];
    }),
  );
  return matches.flat();
}

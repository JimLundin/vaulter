import { sameEntity, type TransactionRef } from '@/core/store/index.ts';
import type { DecisionDatabase, DecisionRef } from './records.ts';

/** Read decisions and provenance from one accepted snapshot. Unknown dates sort last. */
export async function readDecisions(
  db: DecisionDatabase,
  options: { snapshot?: TransactionRef; includeUnavailable?: boolean } = {},
) {
  const snapshot =
    options.snapshot ??
    (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }));
  const view = snapshot ? db.at(snapshot) : db;
  const [decisions, sources] = await Promise.all([
    view.entities.decisions.query({
      limit: null, // Global log includes every available decision before provenance assembly.
      select: { text: true, date: true, rationale: true, attribution: true, available: true },
      ...(options.includeUnavailable ? {} : { where: { available: { eq: true } } }),
    }),
    view.entities.decisionSources.query({
      limit: null, // Assemble source references for the complete decision log.
      select: { decision: true, source: true },
    }),
  ]);
  return decisions
    .map((decision) => ({
      ...decision,
      sources: sources
        .filter((source) => sameEntity(source.decision, decision))
        .map(({ source }) => source),
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}
export type DecisionData = Awaited<ReturnType<typeof readDecisions>>;
export type DecisionRecord = DecisionData[number];

const identities = new Map<string, WeakRef<DecisionRef>>();
/** Stable UI key follows opaque retained identity, including newly read projections. */
export function decisionKey(decision: DecisionRef): string {
  for (const [key, reference] of identities) {
    const previous = reference.deref();
    if (!previous) identities.delete(key);
    else if (sameEntity(previous, decision)) return key;
  }
  const key = crypto.randomUUID();
  identities.set(key, new WeakRef(decision));
  return key;
}

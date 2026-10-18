import {
  clear,
  sameEntity,
  type EntityRef,
  type HistoricalReference,
  type RetainedStateReference,
  type Transaction,
  type TransactionContext,
  type TransactionRef,
} from '@/core/store/index.ts';
import { graphSchemas, type QueryData } from './query.ts';
import type { Query, graphEntities } from './records.ts';
import { readGraph, type GraphDatabase, type QueryCandidate } from './reading.ts';

export type SavedQueryRef = EntityRef<typeof Query>;
export interface SavedQueryInput extends QueryData {
  readonly key: string;
  readonly available?: boolean;
  readonly provenance?: RetainedStateReference;
}

function fields(input: SavedQueryInput) {
  if (!input.key.trim()) throw new Error('Graph query key is required');
  if (input.provenance && input.provenance.type !== 'source.document')
    throw new Error('Query provenance must select a source document');
  const { key, available = true, provenance, ...criteria } = input;
  return {
    key,
    available,
    ...(provenance && { provenance }),
    ...graphSchemas.query.parse(criteria),
  };
}

/** Caller supplies the transaction so source preservation and host placement can be atomic. */
export function savedQueryAdmission(tx: Transaction<typeof graphEntities>) {
  return {
    create: async (input: SavedQueryInput): Promise<SavedQueryRef> => {
      const data = fields(input);
      if (await tx.entities.graphQueries.first({ where: { key: { eq: data.key } }, select: {} }))
        throw new Error('Graph query key is already in use');
      return tx.entities.graphQueries.insert(data);
    },
    /** Full recorded replacement clears absent criteria; it never inherits old filters. */
    replace: async (query: SavedQueryRef, input: SavedQueryInput): Promise<void> => {
      const data = fields(input);
      const current = await tx.entities.graphQueries.get(query, { select: { key: true } });
      if (!current) throw new Error('Graph query is unavailable');
      if (data.key !== current.key) throw new Error('Graph query key cannot change');
      await tx.entities.graphQueries.update({
        ...current,
        available: data.available,
        type: data.type ?? clear,
        tag: data.tag ?? clear,
        sort: data.sort ?? clear,
        provenance: data.provenance ?? clear,
      });
    },
    remove: async (query: SavedQueryRef): Promise<void> => {
      const current = await tx.entities.graphQueries.get(query, { select: {} });
      if (!current) throw new Error('Graph query is unavailable');
      await tx.entities.graphQueries.update({ ...current, available: false });
    },
  };
}

export function savedQueryActions(db: GraphDatabase, context: TransactionContext = {}) {
  return {
    create: (input: SavedQueryInput) =>
      db.transaction(context, (tx) => savedQueryAdmission(tx).create(input)),
    replace: (query: SavedQueryRef, input: SavedQueryInput) =>
      db.transaction(context, (tx) => savedQueryAdmission(tx).replace(query, input)),
    remove: (query: SavedQueryRef) =>
      db.transaction(context, (tx) => savedQueryAdmission(tx).remove(query)),
  };
}

/** Saved criteria are independently readable, including omitted sort and unavailable final fields. */
export async function readQueries(
  db: GraphDatabase,
  options: { snapshot?: TransactionRef; includeUnavailable?: boolean } = {},
) {
  const snapshot =
    options.snapshot ??
    (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }));
  const view = snapshot ? db.at(snapshot) : db;
  return view.entities.graphQueries.query({
    limit: null, // Assemble the complete saved-query owner collection.
    select: { key: true, type: true, tag: true, sort: true, available: true, provenance: true },
    ...(options.includeUnavailable ? {} : { where: { available: { eq: true } } }),
    orderBy: [{ key: 'asc' }],
  });
}

/** Application supplies foreign owner candidates read at this same snapshot. */
export interface SavedQueryCandidate extends QueryCandidate {
  readonly address: HistoricalReference;
  /** Owner's recorded taxonomy, independent of Graph's directed factual edges. */
  readonly classification?: { readonly type?: string; readonly tags: readonly string[] };
}

/** Results are derived at a selected state, never claimed as a recorded execution receipt. */
export async function readQueryEmbed<Candidate extends SavedQueryCandidate>(
  db: GraphDatabase,
  query: SavedQueryRef,
  suppliedCandidates:
    | readonly Candidate[]
    | ((snapshot: TransactionRef) => Promise<readonly Candidate[]>),
  options: { snapshot?: TransactionRef } = {},
) {
  const snapshot =
    options.snapshot ??
    (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }));
  if (!snapshot) return;
  const candidates =
    typeof suppliedCandidates === 'function'
      ? await suppliedCandidates(snapshot)
      : suppliedCandidates;
  const saved = (await readQueries(db, { snapshot })).find((record) => sameEntity(record, query));
  if (!saved) return;
  const criteria = {
    ...(saved.type !== undefined && { type: saved.type }),
    ...(saved.tag !== undefined && { tag: saved.tag }),
    ...(saved.sort !== undefined && { sort: saved.sort }),
  };
  // A candidate's title/order metadata must describe precisely the chosen owner snapshot.
  await Promise.all(
    candidates.map(async (candidate) => {
      const resolved = await db.history.resolve(candidate.address);
      const expected = await db.history.reference(snapshot, resolved.entity);
      if (
        candidate.entity !== expected.entity ||
        candidate.address.transaction !== expected.transaction
      )
        throw new Error('Query candidates must select the query projection snapshot');
    }),
  );
  const graph = await readGraph(db, snapshot);
  return {
    query: saved,
    address: await db.history.reference(snapshot, saved),
    snapshot,
    resultKind: options.snapshot ? ('historical-derived' as const) : ('live-derived' as const),
    criteria,
    results: graph
      .query({}, candidates)
      .filter((candidate) => {
        const { classification } = candidate;
        if (!classification) return graph.query(criteria, [candidate]).length > 0;
        return (
          (!criteria.type || classification.type === criteria.type) &&
          (!criteria.tag || classification.tags.includes(criteria.tag))
        );
      })
      .sort((a, b) => {
        const first = criteria.sort === 'created' ? (a.created ?? '') : a.title;
        const second = criteria.sort === 'created' ? (b.created ?? '') : b.title;
        return first.localeCompare(second) || a.entity.localeCompare(b.entity);
      }),
  };
}

import { clear, type HistoricalReference, type TransactionContext } from '@/core/store/index.ts';
import type { GraphDatabase } from '@/modules/graph/reading.ts';

export interface RelationshipInput {
  predicate?: string;
  source?: HistoricalReference;
  target?: HistoricalReference;
  label?: string;
  direction: 'directed' | 'unknown';
  clarificationReason?: string;
  provenance?: HistoricalReference;
}

export interface RelationshipCandidateActions {
  clarify: (key: string, input: RelationshipInput) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

function validate(input: RelationshipInput) {
  if (!(input.predicate?.trim() || input.label?.trim()))
    throw new Error('A relationship requires a known predicate or label');
  const candidate =
    input.direction === 'unknown' || !input.source || !input.target || !input.predicate?.trim();
  if (candidate && !input.clarificationReason?.trim())
    throw new Error('A candidate requires a clarification reason');
  if (input.provenance && input.provenance.type !== 'source.document')
    throw new Error('Relationship provenance must reference a source document');
  return candidate ? ('candidate' as const) : ('resolved' as const);
}

/** Connections are accepted with their exact endpoints and trusted attribution in one transaction. */
export function graphActions(db: GraphDatabase, context: TransactionContext, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!context.author) throw new Error('Graph changes require trusted attribution');
  return {
    candidate: async (input: RelationshipInput & { key: string }) => {
      signal?.throwIfAborted();
      if (!input.key.trim()) throw new Error('A relationship requires a key');
      const status = validate(input);
      if (status !== 'candidate') throw new Error('A candidate must retain unresolved knowledge');
      return await db.transaction(context, async (tx) => {
        signal?.throwIfAborted();
        if (
          await tx.entities.graphRelationships.first({
            where: { key: { eq: input.key } },
            select: {},
          })
        )
          throw new Error('Relationship key is already in use');
        return tx.entities.graphRelationships.insert({ ...input, status, available: true });
      });
    },
    clarify: async (key: string, input: RelationshipInput) => {
      signal?.throwIfAborted();
      const status = validate(input);
      return await db.transaction(context, async (tx) => {
        signal?.throwIfAborted();
        const existing = await tx.entities.graphRelationships.first({
          where: { key: { eq: key } },
          select: { available: true, provenance: true },
        });
        if (!(existing && existing.available)) throw new Error('Relationship is unavailable');
        await tx.entities.graphRelationships.update({
          ...existing,
          predicate: input.predicate ?? clear,
          source: input.source ?? clear,
          target: input.target ?? clear,
          label: input.label ?? clear,
          direction: input.direction,
          status,
          clarificationReason: status === 'candidate' ? input.clarificationReason! : clear,
          provenance: input.provenance ?? existing.provenance ?? clear,
        });
        return existing;
      });
    },
    connect: async (input: {
      key: string;
      predicate: string;
      source: HistoricalReference;
      target?: HistoricalReference;
      label?: string;
    }) => {
      signal?.throwIfAborted();
      if (!(input.key.trim() && input.predicate.trim()))
        throw new Error('A relationship requires a key and predicate');
      if (!(input.target || input.label?.trim()))
        throw new Error('An unresolved relationship requires a retained target label');
      return await db.transaction(context, async (tx) => {
        signal?.throwIfAborted();
        const existing = await tx.entities.graphRelationships.first({
          where: { key: { eq: input.key } },
          select: {},
        });
        if (existing) throw new Error('Relationship key is already in use');
        signal?.throwIfAborted();
        return tx.entities.graphRelationships.insert({
          ...input,
          available: true,
          status: input.target ? 'resolved' : 'candidate',
          direction: 'directed',
          ...(!input.target
            ? { clarificationReason: 'Target identity requires clarification' }
            : {}),
        });
      });
    },
    remove: (key: string) =>
      db.transaction(context, async (tx) => {
        signal?.throwIfAborted();
        const entity = await tx.entities.graphRelationships.first({
          where: { key: { eq: key } },
          select: {},
        });
        if (!entity) throw new Error('Relationship is unavailable');
        await tx.entities.graphRelationships.update({ ...entity, available: false });
      }),
  };
}

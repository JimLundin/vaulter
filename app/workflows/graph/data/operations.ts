import type { HistoricalReference, TransactionContext } from '@/vault/eav/index.ts';
import type { GraphDatabase } from '@/workflows/graph/reading.ts';

/** Connections are accepted with their exact endpoints and trusted attribution in one transaction. */
export function graphActions(db: GraphDatabase, context: TransactionContext, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!context.author) throw new Error('Graph changes require trusted attribution');
  return {
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
        return tx.entities.graphRelationships.insert({ ...input, available: true });
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

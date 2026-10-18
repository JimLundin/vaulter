import {
  sameEntity,
  type EntityRef,
  type HistoricalReference,
  type RetainedStateReference,
  type Transaction,
  type TransactionRef,
} from '@/core/store/index.ts';
import type { QuerySelection, graphEntities } from './records.ts';
import type { GraphDatabase } from './reading.ts';
import { validateQueryClassification, type QueryClassification } from './saved-queries.ts';

export type QuerySelectionRef = EntityRef<typeof QuerySelection>;
export interface QuerySelectionInput {
  readonly key: string;
  /** Definition selected at the native cutoff used for this evaluation. */
  readonly query: HistoricalReference;
  /** Explicitly distinguishes this capture from an absent original execution. */
  readonly origin: 'migration-evaluation';
  /** Exact preserved source state establishing the original evaluation cutoff. */
  readonly provenance: RetainedStateReference;
  readonly available?: boolean;
  readonly members: readonly {
    readonly page: HistoricalReference;
    readonly correspondence: RetainedStateReference;
    readonly position: number;
    readonly classification?: QueryClassification;
  }[];
}

/** Captures are immutable; a later evaluation receives a separate selection identity. */
export function querySelectionAdmission(tx: Transaction<typeof graphEntities>) {
  return {
    capture: async (input: QuerySelectionInput): Promise<QuerySelectionRef> => {
      if (!input.key.trim() || input.origin !== 'migration-evaluation')
        throw new Error('Query selection requires a key and explicit migration evaluation origin');
      if (input.query.type !== 'graph.query' || input.provenance.type !== 'source.document')
        throw new Error('Query selection must select a Query and source document cutoff');
      const positions = new Set<number>();
      const pages = new Set<string>();
      for (const member of input.members) {
        if (member.classification) validateQueryClassification(member.classification);
        if (member.page.type !== 'wiki.page' || member.correspondence.type !== 'source.document')
          throw new Error(
            'Query results require Page selections and external source correspondence',
          );
        if (member.page.transaction !== input.query.transaction)
          throw new Error('Query result and definition must select the same evaluation cutoff');
        if (
          !Number.isSafeInteger(member.position) ||
          member.position < 0 ||
          positions.has(member.position)
        )
          throw new Error('Query result positions must be unique nonnegative safe integers');
        if (pages.has(member.page.entity)) throw new Error('Query result Pages must be unique');
        positions.add(member.position);
        pages.add(member.page.entity);
      }
      if (
        await tx.entities.graphQuerySelections.first({
          where: { key: { eq: input.key } },
          select: {},
        })
      )
        throw new Error('Query selection key is already in use');
      const selection = await tx.entities.graphQuerySelections.insert({
        key: input.key,
        query: input.query,
        origin: input.origin,
        provenance: input.provenance,
        available: input.available ?? true,
      });
      await Promise.all(
        input.members.map(({ classification, ...member }) =>
          tx.entities.graphQuerySelectionMembers.insert({
            selection,
            ...member,
            ...(classification && {
              ...(classification.type !== undefined && { classificationType: classification.type }),
              classificationTags: classification.tags,
              classificationCutoff: classification.cutoff,
              classificationSources: classification.sources,
              ...(classification.hashes && { classificationHashes: classification.hashes }),
            }),
          }),
        ),
      );
      return selection;
    },
    remove: async (selection: QuerySelectionRef): Promise<void> => {
      const current = await tx.entities.graphQuerySelections.get(selection, { select: {} });
      if (!current) throw new Error('Query selection is unavailable');
      await tx.entities.graphQuerySelections.update({ ...current, available: false });
    },
  };
}

/** Resolve captured member states and order without reevaluating the query against today's data. */
export async function readQuerySelections(
  db: GraphDatabase,
  options: { snapshot?: TransactionRef; includeUnavailable?: boolean } = {},
) {
  const snapshot =
    options.snapshot ??
    (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }));
  const view = snapshot ? db.at(snapshot) : db;
  const [selections, members] = await Promise.all([
    view.entities.graphQuerySelections.query({
      limit: null, // Read complete captured selections before their ordered membership join.
      select: { key: true, query: true, origin: true, provenance: true, available: true },
      ...(options.includeUnavailable ? {} : { where: { available: { eq: true } } }),
      orderBy: [{ key: 'asc' }],
    }),
    view.entities.graphQuerySelectionMembers.query({
      limit: null, // Each selection retains all members, including exact unavailable source states.
      select: {
        selection: true,
        page: true,
        correspondence: true,
        position: true,
        classificationType: true,
        classificationTags: true,
        classificationCutoff: true,
        classificationSources: true,
        classificationHashes: true,
      },
      orderBy: [{ position: 'asc' }],
    }),
  ]);
  return Promise.all(
    selections.map(async (selection) => ({
      ...selection,
      members: await Promise.all(
        members
          .filter((member) => sameEntity(member.selection, selection))
          .map(async (member) => {
            const resolved = await db.history.resolve(member.page);
            const recorded = await db.history.inspect(resolved.transaction, resolved.entity);
            return { ...member, values: recorded?.values };
          }),
      ),
    })),
  );
}

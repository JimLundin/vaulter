import type {
  DomainDatabase,
  HistoricalReference,
  Registry,
  TransactionRef,
} from '@/core/store/index.ts';

/** Live targets retain a validated identity anchor; its snapshot is not the displayed state. */
export type RecordEmbed =
  | { readonly mode: 'live'; readonly target: HistoricalReference }
  | { readonly mode: 'pinned'; readonly target: HistoricalReference };

/** A historical host supplies its cutoff. Live embeds then read that state, never today's state. */
export async function resolveEmbed<R extends Registry>(
  db: DomainDatabase<R>,
  embed: RecordEmbed,
  cutoff?: TransactionRef,
) {
  const resolved = await db.history.resolve(embed.target);
  const snapshot =
    embed.mode === 'pinned'
      ? resolved.transaction
      : (cutoff ??
        (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] })));
  if (!snapshot) throw new Error('Embedded record state is unavailable');
  return { entity: resolved.entity, snapshot };
}

import {
  sameEntity,
  type DomainDatabase,
  type TransactionContext,
  type ReadView,
} from '@/core/store/index.ts';
import type { RecordEmbed } from '@/core/embeds/index.ts';
import type { chatSchema, ExchangeRef } from './records.ts';

export async function appendExchangeEmbed(
  db: DomainDatabase<typeof chatSchema>,
  exchange: ExchangeRef,
  embed: { readonly target: RecordEmbed['target']; readonly mode?: RecordEmbed['mode'] },
  order: number,
  context: TransactionContext = {},
) {
  if (!Number.isFinite(order)) throw new Error('Embed placement requires a finite order');
  return db.transaction(context, async (tx) => {
    if (!(await tx.entities.exchanges.get(exchange, { select: {} })))
      throw new Error('Exchange is unavailable');
    return tx.entities.exchangeEmbeds.insert({
      exchange,
      order,
      mode: embed.mode ?? 'live',
      target: embed.target,
      available: true,
    });
  });
}

export async function readExchangeEmbeds(view: ReadView<typeof chatSchema>, exchange: ExchangeRef) {
  const placements = await view.entities.exchangeEmbeds.query({
    limit: null, // Preserve every host placement and its order.
    select: { exchange: true, order: true, mode: true, target: true },
    where: { available: { eq: true } },
    orderBy: [{ order: 'asc' }],
  });
  return placements.filter((placement) => sameEntity(placement.exchange, exchange));
}

export async function removeExchangeEmbed(
  db: DomainDatabase<typeof chatSchema>,
  placement: Awaited<ReturnType<typeof readExchangeEmbeds>>[number],
  context: TransactionContext = {},
) {
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.exchangeEmbeds.get(placement, { select: {} });
    if (!current) throw new Error('Embed placement is unavailable');
    await tx.entities.exchangeEmbeds.update({ ...current, available: false });
  });
}

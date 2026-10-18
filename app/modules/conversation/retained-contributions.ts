import type { JsonValue, Transaction } from '@/core/store/index.ts';
import type { chatSchema, ExchangeRef } from './records.ts';
import type { MessageData } from './message.ts';
import { parseMessage } from './message-schema.ts';

/** Retain a supplied contribution without creating an Agent run or execution receipt. */
export async function appendRetainedContribution(
  tx: Transaction<typeof chatSchema>,
  exchange: ExchangeRef,
  options: {
    readonly position: number;
    readonly message: MessageData;
    readonly provenance: JsonValue;
  },
) {
  if (!Number.isFinite(options.position)) throw new Error('Contribution position must be finite');
  if (!(await tx.entities.exchanges.get(exchange, { select: {} })))
    throw new Error('Exchange is unavailable');
  const message = parseMessage(options.message);
  if (message.embeds !== undefined) throw new Error('Embeds require their own Exchange placements');
  return tx.entities.retainedSources.insert({
    exchange,
    position: options.position,
    occurredAt: message.at,
    ...(message.atPrecision !== undefined && { occurredAtPrecision: message.atPrecision }),
    provenance: options.provenance,
    ...(message.role === 'agent'
      ? {
          speaker: 'agent' as const,
          activity: message.parts,
          status: message.status,
          ...(message.model !== undefined && { model: message.model }),
          ...(message.tokens !== undefined && { tokens: message.tokens }),
          ...(message.error !== undefined && { error: message.error }),
        }
      : {
          speaker: message.role === 'user' ? ('user' as const) : ('unknown' as const),
          text: message.text,
          ...(message.role === 'user' && message.input !== undefined && { input: message.input }),
          ...(message.role === 'record' &&
            message.record.label !== undefined && {
              label: message.record.label,
            }),
        }),
  });
}

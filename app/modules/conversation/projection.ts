import { readExchangeEmbeds } from './embeds.ts';
import type { ReadView } from '@/core/store/index.ts';
import type { chatSchema, ExchangeRef } from './records.ts';
import { readExchange } from './submission.ts';
import { parseMessage } from '@/modules/conversation/message-schema.ts';
import type { MessageData } from '@/modules/conversation/message.ts';
export async function projectedExchange(
  tx: ReadView<typeof chatSchema>,
  identity: ExchangeRef,
  options: { readonly includeEmbeds?: boolean } = {},
): Promise<MessageData[]> {
  const exchange = await readExchange(tx, identity);
  if (!exchange) throw new Error('Dialogue contribution is unavailable');
  const result: MessageData[] = exchange.sources.map((source) =>
    parseMessage({
      kind: 'message',
      at: source.occurredAt,
      ...(source.occurredAtPrecision && { atPrecision: source.occurredAtPrecision }),
      ...(source.speaker === 'agent'
        ? {
            role: 'agent',
            status: source.status ?? 'running',
            parts: source.activity ?? [],
            ...(source.model !== undefined && { model: source.model }),
            ...(source.tokens !== undefined && { tokens: source.tokens }),
            ...(source.error !== undefined && { error: source.error }),
          }
        : source.speaker === 'user'
          ? {
              role: 'user',
              text: source.text ?? '',
              ...(source.input !== undefined && { input: source.input }),
            }
          : {
              role: 'record',
              text: source.text ?? '',
              record: { kind: 'summary', ...(source.label && { label: source.label }) },
            }),
    }),
  );
  result.push(
    ...exchange.messages.map((message) => ({
      kind: 'message' as const,
      role: 'user' as const,
      at: message.at.toISOString(),
      text: message.text,
      ...(message.input !== undefined && { input: message.input }),
    })),
  );
  const run = exchange.execution;
  if (run) {
    result.push({ kind: 'message', role: 'agent', ...run });
  }
  const placements = options.includeEmbeds === false ? [] : await readExchangeEmbeds(tx, identity);
  if (result.length && placements.length)
    result[0] = { ...result[0]!, embeds: placements.map(({ mode, target }) => ({ mode, target })) };
  return result;
}

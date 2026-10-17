import type { ReadView } from '@/vault/eav/index.ts';
import type { chatSchema, ExchangeRef } from './schema.ts';
import { readExchange } from './operations.ts';
import { parseMessage } from '@/workflows/chat/message-schema.ts';
import type { MessageData } from '@/workflows/chat/message.ts';
export async function projectedExchange(
  tx: ReadView<typeof chatSchema>,
  identity: ExchangeRef,
): Promise<MessageData[]> {
  const exchange = await readExchange(tx, identity);
  if (!exchange) throw new Error('Dialogue contribution is unavailable');
  const result: MessageData[] = exchange.sources.map((source) =>
    parseMessage({
      kind: 'message',
      at: source.occurredAt,
      ...(source.occurredAtPrecision && { atPrecision: source.occurredAtPrecision }),
      ...(source.speaker === 'agent'
        ? { role: 'agent', status: source.status ?? 'running', parts: source.activity ?? [] }
        : source.speaker === 'user'
          ? { role: 'user', text: source.text ?? '' }
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
    })),
  );
  const run = exchange.execution;
  if (run) {
    result.push({ kind: 'message', role: 'agent', ...run });
  }
  return result;
}

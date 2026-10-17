import { modelMessageSchema } from 'ai';
import type { ReadView } from '@/vault/eav/index.ts';
import type { chatSchema, ExchangeRef } from './schema.ts';
import { readExchange } from './operations.ts';
import { parseMessage } from '@/workflows/chat/records/chat-schema.ts';
import type { MessageData, MessagePart } from '@/workflows/chat/records/chat.ts';
const jsonError = (value: unknown) =>
  value && typeof value === 'object' && 'message' in value ? String(value.message) : undefined;

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
    const receipts = run.executions.map((execution) => ({
      kind: 'tool' as const,
      callId: execution.call,
      name: execution.tool.name,
      // Unversioned module tools use an explicit storage marker; legacy presenters omit it.
      version: execution.tool.version === 'unversioned' ? undefined : execution.tool.version,
      input: execution.input,
      status: execution.status,
      ...(execution.output !== undefined && { output: execution.output }),
      ...(execution.error !== undefined && { error: jsonError(execution.error) }),
    }));
    const parts: MessagePart[] = [];
    for (const step of run.steps) {
      const response = step.response;
      if (
        !(
          response &&
          typeof response === 'object' &&
          'messages' in response &&
          Array.isArray(response.messages)
        )
      )
        continue;
      for (const raw of response.messages) {
        const message = modelMessageSchema.parse(raw);
        if (message.role !== 'assistant') continue;
        if (typeof message.content === 'string')
          parts.push({ kind: 'text', text: message.content });
        else
          for (const block of message.content) {
            if (block.type === 'text') parts.push({ kind: 'text', text: block.text });
            if (block.type === 'tool-call') {
              const receipt = receipts.find((item) => item.callId === block.toolCallId);
              if (
                receipt &&
                !parts.some((item) => item.kind === 'tool' && item.callId === receipt.callId)
              )
                parts.push(receipt);
            }
          }
      }
    }
    // Partial or opaque external execution can expose receipts without an observable model response.
    for (const receipt of receipts)
      if (!parts.some((part) => part.kind === 'tool' && part.callId === receipt.callId))
        parts.push(receipt);
    if (
      run.output &&
      typeof run.output === 'object' &&
      'text' in run.output &&
      typeof run.output.text === 'string'
    ) {
      const recordedText = parts
        .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
        .join('');
      const remaining = run.output.text.startsWith(recordedText)
        ? run.output.text.slice(recordedText.length)
        : '';
      if (remaining) parts.push({ kind: 'text', text: remaining });
    }
    result.push({
      kind: 'message',
      role: 'agent',
      at: run.startedAt.toISOString(),
      status: run.status,
      parts,
      model: run.servedModel ?? run.requestedModel,
      ...(run.inputTokens !== undefined &&
        run.outputTokens !== undefined && {
          tokens: { in: run.inputTokens, out: run.outputTokens },
        }),
      ...(run.error !== undefined && { error: jsonError(run.error) }),
    });
  }
  return result;
}

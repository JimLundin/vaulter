// Execution-neutral provider history. Producers retain their own records and exact evidence links.
import type { ModelMessage } from 'ai';
import type { JsonValue } from '../vault/nodes/model.ts';

export type HistoryPart =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'tool';
      readonly callId: string;
      readonly name: string;
      readonly input: JsonValue;
      readonly status: 'running' | 'complete' | 'failed';
      readonly output?: JsonValue;
      readonly error?: string;
    };
export type ProviderHistory =
  | { readonly role: 'user'; readonly text: string }
  | { readonly role: 'agent'; readonly parts: readonly HistoryPart[] };

export function historyModelMessages(history: readonly ProviderHistory[]): ModelMessage[] {
  return history.flatMap((message): ModelMessage[] => {
    if (message.role === 'user') return [{ role: 'user', content: message.text }];
    return message.parts.flatMap((part): ModelMessage[] => {
      if (part.kind === 'text') return [{ role: 'assistant', content: part.text }];
      return [
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolCallId: part.callId, toolName: part.name, input: part.input },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: part.callId,
              toolName: part.name,
              output:
                part.status === 'running'
                  ? { type: 'error-text', value: 'Outcome is uncertain; do not repeat this tool.' }
                  : part.status === 'failed'
                    ? {
                        type: 'error-text',
                        value: part.error ?? 'Tool failed; inspect recorded history.',
                      }
                    : { type: 'json', value: part.output ?? null },
            },
          ],
        },
      ];
    });
  });
}

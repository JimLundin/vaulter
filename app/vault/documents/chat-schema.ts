// Validate known feature fields while retaining every submitted JSON field for future readers.
import { z } from 'zod';
import type { JsonValue } from '../nodes/model.ts';
import { canonical, frozen } from '../nodes/json.ts';
import type { ChatReferenceData, ConversationData, ExchangeData, MessageData } from './chat.ts';

const instant = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const json = z.custom<JsonValue>((value) => {
  try {
    canonical(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid JSON');
const conversation = z.object({
  kind: z.literal('conversation'),
  title: z.string(),
  createdAt: instant,
});
const exchange = z.object({
  kind: z.literal('exchange'),
  startedAt: instant,
  time: z
    .object({
      timezone: z.string().min(1),
      offsetMinutes: z.number().int().min(-840).max(840),
    })
    .optional(),
  capture: z.object({ procedure: z.string(), summary: z.string() }).optional(),
});
const message = z.discriminatedUnion('role', [
  z.object({
    kind: z.literal('message'),
    role: z.literal('user'),
    at: instant,
    text: z.string(),
    input: z
      .object({
        methods: z.array(z.enum(['typed', 'dictated', 'pasted', 'imported', 'shared'])),
        language: z.string().optional(),
        transcription: z
          .object({
            provider: z.string().min(1),
            model: z.string().min(1),
            request: z.string().optional(),
            started: instant,
            ended: instant,
            durationMs: z.number().nonnegative().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal('message'),
    role: z.literal('agent'),
    at: instant,
    status: z.enum(['running', 'complete', 'stopped', 'failed', 'interrupted']),
    parts: z.array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('text'), text: z.string() }),
        z.object({
          kind: z.literal('tool'),
          callId: z.string().min(1),
          name: z.string().min(1),
          input: json,
          status: z.enum(['running', 'complete', 'failed']),
          output: json.optional(),
          error: z.string().optional(),
        }),
      ]),
    ),
    model: z.string().optional(),
    tokens: z.object({ in: count, out: count }).optional(),
    error: z.string().optional(),
  }),
]);
const reference = z.object({
  kind: z.literal('reference'),
  role: z.enum(['topic', 'place']),
});

function checked<Data>(schema: z.ZodType, value: unknown): Data {
  canonical(value);
  schema.parse(value);
  // Parsing checks the schema; the original complete JSON becomes the immutable payload.
  return frozen(structuredClone(value)) as Data;
}

export const parseChatInstant = (value: string): string => instant.parse(value);
export const parseConversation = (value: unknown): ConversationData => checked(conversation, value);
export const parseExchange = (value: unknown): ExchangeData => checked(exchange, value);
export const parseMessage = (value: unknown): MessageData => checked(message, value);
export const parseChatReference = (value: unknown): ChatReferenceData => checked(reference, value);

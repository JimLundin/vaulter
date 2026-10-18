import { z } from 'zod';
import type { JsonValue } from '@/application/store/index.ts';
import { canonical, frozen } from '@/application/store/index.ts';
import { precision } from '@/conversation/retained-values.ts';
import type { MessageData } from './message.ts';

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
const message = z.discriminatedUnion('role', [
  z.object({
    kind: z.literal('message'),
    role: z.literal('user'),
    at: instant,
    atPrecision: precision.optional(),
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
    atPrecision: precision.optional(),
    status: z.enum(['running', 'complete', 'stopped', 'failed', 'interrupted']),
    parts: z.array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('text'), text: z.string() }),
        z.object({
          kind: z.literal('tool'),
          callId: z.string().min(1),
          name: z.string().min(1),
          version: z.string().min(1).optional(),
          input: json,
          status: z.enum(['running', 'complete', 'failed', 'cancelled']),
          output: json.optional(),
          error: z.string().optional(),
        }),
      ]),
    ),
    model: z.string().optional(),
    tokens: z.object({ in: count, out: count }).optional(),
    error: z.string().optional(),
  }),
  z.object({
    kind: z.literal('message'),
    role: z.literal('record'),
    at: instant,
    atPrecision: precision.optional(),
    text: z.string(),
    record: z.object({ kind: z.literal('summary'), label: z.string().min(1).optional() }),
  }),
]);

export function parseMessage(value: unknown): MessageData {
  canonical(value);
  message.parse(value);
  return frozen(structuredClone(value)) as MessageData;
}

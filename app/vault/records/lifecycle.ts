// Task and decision records: never deleted; their lifecycle is their state and their
// relationships. Unclaimed until the Tasks and Decisions modules exist.
import { z } from 'zod';
import { localDate, text } from './common.ts';

export const taskSchemas = {
  task: z.strictObject({
    kind: z.literal('task'),
    what: text,
    due: localDate.optional(),
    status: z.enum(['open', 'completed', 'abandoned']),
  }),
} as const;
export const decisionSchemas = {
  decision: z.strictObject({
    kind: z.literal('decision'),
    date: localDate,
    what: text,
    why: text.optional(),
  }),
} as const;

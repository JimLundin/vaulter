// Task, question and decision records: never deleted; their lifecycle is their state and their
// relationships. Unclaimed until the Tasks, Questions and Decisions modules exist
// (docs/specs/vault-records.md).
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
export const questionSchemas = {
  /** Answered exactly when it has an answered-by relationship to its answer; abandoned when given up. */
  question: z.strictObject({
    kind: z.literal('question'),
    text,
    abandoned: z.literal(true).optional(),
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

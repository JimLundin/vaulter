// Calendar records: a date attached to what it is placed under, and dated sequences on pages.
// Unclaimed until the Calendar module exists (docs/specs/vault-records.md).
import { z } from 'zod';
import { localDate, text } from './common.ts';

export const calendarSchemas = {
  date: z.strictObject({
    kind: z.literal('date'),
    date: localDate,
    end: localDate.optional(),
    repeat: z.enum(['yearly', 'monthly', 'weekly']).optional(),
    label: text.optional(),
  }),
  timeline: z.strictObject({ kind: z.literal('timeline') }),
} as const;

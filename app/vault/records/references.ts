// Reference records: web resources linked or cited. Unclaimed until the References module exists.
import { z } from 'zod';
import { text } from './common.ts';

export const referenceSchemas = {
  resource: z.strictObject({ kind: z.literal('resource'), url: z.url(), title: text.optional() }),
} as const;

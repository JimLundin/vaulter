import { z } from 'zod';
import { text } from '@/vault/records/common.ts';

export const graphSchemas = {
  query: z.strictObject({
    type: text.optional(),
    tag: text.optional(),
    sort: z.enum(['title', 'created']).optional(),
  }),
};
export type QueryData = z.infer<typeof graphSchemas.query>;

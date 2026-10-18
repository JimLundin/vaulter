import { z } from 'zod';
const text = z.string().min(1);

export const graphSchemas = {
  query: z.strictObject({
    type: text.optional(),
    tag: text.optional(),
    sort: z.enum(['title', 'created']).optional(),
  }),
};
export type QueryData = z.infer<typeof graphSchemas.query>;

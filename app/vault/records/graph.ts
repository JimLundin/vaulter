// Graph records: facts between nodes, the vocabulary, and live page lists. Unclaimed until the Graph
// module exists.
import { z } from 'zod';
import { text } from './common.ts';

export const graphSchemas = {
  /** Placed under its subject; connection: subject → object. label: what the source named, kept only
   * while the object is unresolved. */
  relationship: z.strictObject({
    kind: z.literal('relationship'),
    predicate: text,
    label: text.optional(),
  }),
  /** Placed under its scheme, itself a term of scheme 'scheme'. */
  term: z.strictObject({
    kind: z.literal('term'),
    scheme: text,
    key: text,
    label: text.optional(),
    use: text.optional(),
    inverse: text.optional(),
    symmetric: z.boolean().optional(),
  }),
  query: z.strictObject({
    kind: z.literal('query'),
    type: text.optional(),
    tag: text.optional(),
    sort: z.enum(['title', 'created']).optional(),
  }),
} as const;

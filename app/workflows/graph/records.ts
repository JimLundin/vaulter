// Graph owns relationships, vocabulary terms and live queries. Retain the imported payload shapes.
import { z } from 'zod';
import type { JsonObject } from '../../vault/nodes/model.ts';
import { canonical, frozen } from '../../vault/nodes/json.ts';
import { text } from '../../vault/records/common.ts';

export const graphSchemas = {
  /** Placement and connection source are independent. A missing connection retains a source label. */
  relationship: z.strictObject({
    kind: z.literal('relationship'),
    predicate: text,
    label: text.optional(),
  }),
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

export type RelationshipData = z.infer<typeof graphSchemas.relationship>;
export type TermData = z.infer<typeof graphSchemas.term>;
export type QueryData = z.infer<typeof graphSchemas.query>;
export type GraphData = RelationshipData | TermData | QueryData;

/** Validate without stripping, normalizing or rewriting accepted JSON. */
export function parseGraphRecord(value: unknown): JsonObject {
  canonical(value);
  const kind = (value as { kind?: unknown } | null)?.kind;
  const schema =
    typeof kind === 'string' && Object.hasOwn(graphSchemas, kind)
      ? graphSchemas[kind as keyof typeof graphSchemas]
      : undefined;
  if (!schema) throw new Error(`Unknown Graph record kind: ${String(kind)}`);
  schema.parse(value);
  return frozen(structuredClone(value)) as JsonObject;
}

// Schemas for vault records whose modules are not implemented yet, by kind. A module claims its kinds
// by moving their schemas into itself; the stored shapes do not change (docs/specs/vault-records.md).
import type { z } from 'zod';
import type { JsonObject } from '../nodes/model.ts';
import { canonical, frozen } from '../nodes/json.ts';
import { wikiSchemas } from './wiki.ts';
import { graphSchemas } from './graph.ts';
import { calendarSchemas } from './calendar.ts';
import { decisionSchemas, questionSchemas, taskSchemas } from './lifecycle.ts';
import { referenceSchemas } from './references.ts';
import { identitySchemas } from './identities.ts';

export const recordSchemas: Readonly<Record<string, z.ZodType>> = {
  ...wikiSchemas,
  ...graphSchemas,
  ...calendarSchemas,
  ...taskSchemas,
  ...questionSchemas,
  ...decisionSchemas,
  ...referenceSchemas,
  ...identitySchemas,
};
export const recordKinds: ReadonlySet<string> = new Set(Object.keys(recordSchemas));

/** Validate a record of an unclaimed kind; throws for an unknown kind or an invalid payload. */
export function parseVaultRecord(value: unknown): JsonObject {
  canonical(value);
  const kind = (value as { kind?: unknown } | null)?.kind;
  const schema = typeof kind === 'string' ? recordSchemas[kind] : undefined;
  if (!schema) throw new Error(`Unknown record kind: ${String(kind)}`);
  schema.parse(value);
  return frozen(structuredClone(value)) as JsonObject;
}

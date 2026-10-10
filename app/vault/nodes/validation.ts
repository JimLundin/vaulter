// Runtime validation at persistence and tool ingress; feature payload validation remains above it.
import { z } from 'zod';
import type { NodeCommit } from './store.ts';
import type { NodeVersion, Transaction } from './model.ts';
import { canonical } from './json.ts';
import { jsonObject, jsonRecord } from './json-schema.ts';

const identity = z
  .string()
  .min(1)
  .refine((value) => value === value.trim(), 'Identity must not have surrounding whitespace');
const address = z.strictObject({ node: identity, transaction: identity.optional() });
const placement = z.strictObject({ parent: identity, order: z.string().min(1) }).nullable();
const connection = z.strictObject({ source: address, target: address }).nullable();
const state = { placement, connection, data: jsonObject.nullable() };
const kind = z.strictObject({ scope: identity, action: identity });
const transaction = z.strictObject({
  id: identity,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  recordedAt: z.iso.datetime({ offset: true }),
  recordedBy: identity,
  kind,
  message: z.string().nullable(),
  origin: identity.nullable(),
  undoOf: identity.nullable(),
  metadata: jsonObject.optional(),
});
const change = z.strictObject({ node: identity, expected: identity.nullable(), ...state });
const version = z.strictObject({
  key: z.strictObject({ node: identity, transaction: identity }),
  ...state,
});
const commit = transaction.omit({ sequence: true, recordedAt: true }).extend({
  changes: z.array(change).min(1),
  expectedReads: jsonRecord(identity, identity.nullable()).optional(),
});
const envelope = z.strictObject({
  format: z.literal(1),
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  transaction,
  versions: z.array(version).min(1),
});

/** One atomic published transaction; transport encoding is private to adapters. */
export interface NodeRecord {
  readonly format: 1;
  readonly requestDigest: string;
  readonly transaction: Transaction;
  readonly versions: readonly NodeVersion[];
}

// These assertions narrow validated extensible kinds; unknown well-formed kinds remain readable.
export function parseCommit(value: unknown): NodeCommit {
  canonical(value);
  return commit.parse(value) as NodeCommit;
}
export function parseRecord(value: unknown): NodeRecord {
  canonical(value);
  return envelope.parse(value) as NodeRecord;
}

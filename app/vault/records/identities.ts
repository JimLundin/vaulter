// Identity records: who authors transactions. Bootstrapped by application identities.
import { z } from 'zod';
import { text } from './common.ts';
import type { NodeVersion } from '../nodes/model.ts';

export const identitySchemas = {
  actor: z.strictObject({ kind: z.literal('actor'), name: text }),
  agent: z.strictObject({ kind: z.literal('agent'), name: text }),
} as const;

/** The viewing Snapshot supplies identity names; consumers own their attribution wording. */
export function identityName(node: NodeVersion): string | undefined {
  const { data } = node;
  if (!(data?.kind === 'actor' || data?.kind === 'agent')) return;
  return typeof data.name === 'string' ? data.name : data.kind === 'agent' ? 'agent' : 'you';
}

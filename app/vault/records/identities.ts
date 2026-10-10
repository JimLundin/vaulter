// Identity records: who authors transactions. Bootstrapped by application identities.
import { z } from 'zod';
import { text } from './common.ts';

export const identitySchemas = {
  actor: z.strictObject({ kind: z.literal('actor'), name: text }),
  agent: z.strictObject({ kind: z.literal('agent'), name: text }),
} as const;

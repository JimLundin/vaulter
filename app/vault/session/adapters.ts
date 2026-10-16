import type { NodeBackend } from '../nodes/store.ts';
import type { Secrets } from './sealed.ts';

/** Session opens node storage with unlocked credentials. */
export type OpenNodes = (options: { readonly secrets: Secrets }) => NodeBackend;

/** EAV credentials are read at request time so replacing a token retains pending saves. */
export type OpenEav = (options: {
  readonly secrets: () => Secrets | null;
}) => import('../eav/index.ts').MemoryStorage;

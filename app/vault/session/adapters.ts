import type { NodeBackend } from '../nodes/store.ts';
import type { VaultBackend } from '../storage/files/backend.ts';
import type { Secrets } from './sealed.ts';

/** Session opens adapters with unlocked credentials; persistence contracts contain no secrets. */
export type OpenNodes = (options: { readonly secrets: Secrets }) => NodeBackend;
export type OpenBackend = (options: {
  readonly secrets: Secrets;
  readonly keeps: (path: string) => boolean;
}) => VaultBackend;

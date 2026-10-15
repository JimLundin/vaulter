import type { NodeBackend } from '../nodes/store.ts';
import type { Secrets } from './sealed.ts';

/** Session opens node storage with unlocked credentials. */
export type OpenNodes = (options: { readonly secrets: Secrets }) => NodeBackend;

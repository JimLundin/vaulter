import type { Secrets } from './sealed.ts';

/** EAV credentials are read at request time so replacing a token retains pending saves. */
export type OpenEav = (options: {
  readonly secrets: () => Secrets | null;
  readonly api?: string;
}) => import('@/vault/eav/index.ts').MemoryStorage;

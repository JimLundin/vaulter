import type { Secrets } from './sealed.ts';

/** EAV credentials are read at request time so replacing a token retains pending saves. */
export type OpenJournal = (options: {
  readonly secrets: () => Secrets | null;
  readonly api?: string;
}) => import('@/core/store/index.ts').JournalStorage;

// Storage: records in this browser, in its own IndexedDB database, for every extension that keeps data.
// Keeping them elsewhere (in git, a hosted database) is a change to this extension.

import { localRecords } from './records.ts';
import { idbStore } from './store.ts';

export * from './api.ts';
export { idbStore } from './store.ts';

/** Records as `caller` has them: its own types to write, and any type it has a handle for to read. */
export const recordsFor = localRecords(idbStore('storage'));

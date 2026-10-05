// Storage: records in this browser, in its own IndexedDB database, for every extension that keeps data.
// Keeping them elsewhere (in git, a hosted database) is a change to this extension.

import { collections } from './records.ts';
import { idbStore } from './store.ts';

export * from './api.ts';
export { idbStore } from './store.ts';

/** The collection `name` (by convention `<extension>/<what>`), typed by what it holds. */
export const collection = collections(idbStore('storage'));

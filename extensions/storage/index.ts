// Storage: records in this browser, in typed collections, for every
// extension that keeps data.

import { collections } from './records.ts';
import { idbStore } from './store.ts';

export * from './api.ts';
export { idbStore } from './store.ts';

/** The collection `name`, by convention `<extension>/<what>`, typed by what
 * it holds. */
export const collection = collections(idbStore('storage'));

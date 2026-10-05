// Records in this browser, in store-local's own IndexedDB database, for every extension that keeps data.
// Keeping them elsewhere (in git, an embedded database) is a change to this extension, or a new one its
// importers move to.

import { localRecords } from './records.ts';
import { idbStore } from './store.ts';

export * from './api.ts';

/** `recordsFor(caller)`: records as `caller` has them, its own types to write and any type it has a
 * handle for to read. `forget(caller)` drops every type it registered, and their records. */
export const { make: recordsFor, forget } = await localRecords(idbStore());

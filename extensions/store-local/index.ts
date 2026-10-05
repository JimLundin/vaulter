// Records in this browser, in store-local's own IndexedDB database: what #records names in
// package.json. Another provider (one that keeps them in git, an embedded database) replaces it by
// exporting the same `recordsFor` and `forget` and passing records' conformance suite in CI.

import { localRecords } from './records.ts';
import { idbStore } from './store.ts';

/** `recordsFor(caller)`: records as `caller` has them, its own types to write and any type it has a
 * handle for to read. `forget(caller)` drops every type it registered, and their records. */
export const { make: recordsFor, forget } = await localRecords(idbStore());

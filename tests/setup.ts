// Every test gets an empty IndexedDB, as a fresh browser would: storage opens
// its own database.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';

beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
});

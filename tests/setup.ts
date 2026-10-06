// Every test gets an empty IndexedDB, as a fresh browser would: storage opens
// its own database. It runs in a page with no secrets.json and no network,
// until it serves one of its own (servePage in app.ts).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    vi.stubGlobal('location', new URL('https://vaulter.test/'));
    vi.stubGlobal('fetch', () =>
        Promise.resolve(
            new Response('<!doctype html>', {
                status: 404,
                headers: { 'Content-Type': 'text/html' },
            }),
        ),
    );
});

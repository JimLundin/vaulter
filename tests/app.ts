// Running the app in tests. restart() gives the next imports fresh modules
// over the same IndexedDB, as the page's next start would. A test then
// imports the extensions it uses (`await import('#extensions/wiki')`), and
// each starts as it is imported, with the extensions it imports.
import { vi } from 'vitest';

/** Starts the page again: the same device, fresh modules. */
export function restart() {
    vi.resetModules();
}

/** This page, at https://vaulter.test/, with `file` as its secrets.json; every
 * other request goes to `other`. */
export function servePage(file: unknown, other: typeof fetch) {
    vi.stubGlobal('location', new URL('https://vaulter.test/'));
    vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) =>
        String(url) === 'https://vaulter.test/secrets.json'
            ? Promise.resolve(Response.json(file))
            : other(url, init),
    );
}

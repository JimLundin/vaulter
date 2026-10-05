// Running the app in tests: the same kernel as in the browser, on a fresh set of modules each start
// (vi.resetModules), so starting again within a test is the page's next start: the same IndexedDB, new
// modules. After a start, a test imports what it uses (`await import('#extensions/wiki')`) and gets
// the modules the app has. A fixture extension is just the exports it would have.
import { vi } from 'vitest';

type Exports = Record<string, unknown>;

const repo = Object.fromEntries(
  Object.entries(import.meta.glob<Exports>('../extensions/*/index.ts')).map(([path, importIt]) => [
    path.split('/').at(-2) ?? path,
    importIt,
  ]),
);

/** Every extension in the repo. */
export const REPO = Object.keys(repo);

/** Starts the repo's extensions `ids`, and `fixtures` beside them, as a page would; the kernel. */
export async function startApp(ids: string[], fixtures: Record<string, Exports> = {}) {
  vi.resetModules();
  const kernel = await import('../src/kernel/kernel.ts');
  const modules = await Promise.all(ids.map(async (id) => [id, await repo[id]()] as const));
  kernel.load({ ...Object.fromEntries(modules), ...fixtures });
  return kernel;
}

/** This page, at https://vaulter.test/, with `file` as its secrets.json; every other request goes to
 * `other`. */
export function servePage(file: unknown, other: typeof fetch) {
  vi.stubGlobal('location', new URL('https://vaulter.test/'));
  vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) =>
    String(url) === 'https://vaulter.test/secrets.json'
      ? Promise.resolve(Response.json(file))
      : other(url, init),
  );
}

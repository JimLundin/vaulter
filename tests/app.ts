// Running the app in tests: the same kernel as in the browser, on a fresh set of modules each start
// (vi.resetModules), so starting again within a test is the page's next start: the same IndexedDB, new
// modules. After a start, a test imports what it uses (`await import('#extensions/wiki')`) and gets
// the modules the app has. A fixture extension is an about and the exports it would have.
import { vi } from 'vitest';
import type { About, Exports, Folders, Settings } from '../src/kernel/kernel.ts';

const id = (path: string) => path.split('/').at(-2) ?? path;
const byId = <T>(m: Record<string, T>) =>
  Object.fromEntries(Object.entries(m).map(([path, v]) => [id(path), v]));

const repo: Folders = {
  about: byId(
    import.meta.glob<About>('../extensions/*/about.ts', { eager: true, import: 'about' }),
  ),
  load: byId(import.meta.glob<Exports>('../extensions/*/index.ts')),
};

/** Every extension in the repo. */
export const REPO = Object.keys(repo.about);

export interface Fixture {
  about?: About;
  load: () => Promise<Exports>;
}

export interface AppOptions {
  /** Extensions that aren't in the repo, by id. */
  fixtures?: Record<string, Fixture>;
  /** This device's settings, kept from one start to the next when the same object is passed. */
  settings?: { current: Settings };
}

/** Starts the repo's extensions `ids` and any fixtures, as a page would; the kernel it started. */
export async function startApp(ids: string[], opts: AppOptions = {}) {
  vi.resetModules();
  const kernel = await import('../src/kernel/kernel.ts');
  const fixtures = Object.entries(opts.fixtures ?? {});
  const settings = opts.settings ?? { current: { enabled: {} } };
  await kernel.boot(
    {
      about: {
        ...Object.fromEntries(ids.map((x) => [x, repo.about[x]])),
        ...Object.fromEntries(fixtures.map(([x, f]) => [x, f.about ?? { version: '0.0.0' }])),
      },
      load: {
        ...Object.fromEntries(ids.map((x) => [x, repo.load[x]])),
        ...Object.fromEntries(fixtures.map(([x, f]) => [x, f.load])),
      },
    },
    {
      settings: {
        get: () => settings.current,
        set: (s) => {
          settings.current = s;
        },
      },
      reload: () => undefined,
    },
  );
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

import { expect, test } from 'vitest';
import { Conflict } from '../shell/backend.ts';
import { folderBackend, type FileEntry, type Folder } from './folder.ts';

// A directory in memory, with only what folder.ts uses; every write ticks the clock.
let clock = 0;
const opened: string[] = [];
function fakeDir(name: string, tree: Record<string, string | Record<string, string>>): Folder {
  const kids = new Map<string, FileEntry | Folder>();
  const file = (n: string, text: string): FileEntry => {
    let f = new File([text], n, { lastModified: ++clock });
    return {
      kind: 'file',
      name: n,
      getFile: async () => f,
      createWritable: () => {
        let out = '';
        return Promise.resolve({
          write: (t) => {
            out += t;
            return Promise.resolve();
          },
          close: () => {
            f = new File([out], n, { lastModified: ++clock });
            return Promise.resolve();
          },
        });
      },
    };
  };
  for (const [k, v] of Object.entries(tree))
    kids.set(k, typeof v === 'string' ? file(k, v) : fakeDir(k, v));
  const get = (n: string, create: boolean | undefined, make: () => FileEntry | Folder) => {
    if (!kids.has(n)) {
      if (!create) throw new DOMException(n, 'NotFoundError');
      kids.set(n, make());
    }
    return kids.get(n)!;
  };
  return {
    kind: 'directory',
    name,
    async *values() {
      opened.push(name);
      yield* kids.values();
    },
    getDirectoryHandle: async (n, o) => get(n, o?.create, () => fakeDir(n, {})) as Folder,
    getFileHandle: async (n, o) => get(n, o?.create, () => file(n, '')) as FileEntry,
    removeEntry: (n) =>
      kids.delete(n) ? Promise.resolve() : Promise.reject(new DOMException(n, 'NotFoundError')),
  };
}

const vault = () =>
  fakeDir('vault', {
    'Home.md': '# Home',
    'README.md': 'not a page',
    'notes.txt': 'no',
    daily: { '2026-10-03.md': '# Today' },
    meta: { 'conventions.md': '# Conventions' },
    node_modules: { 'x.md': 'never' },
    site: { 'README.md': 'never' },
    '.git': { HEAD: 'never' },
  });
const paths = (h: { files: { path: string }[] }) => h.files.map((f) => f.path);
const ok = () => Promise.resolve();
const sorted = (a: string[]) => a.sort((x, y) => (x < y ? -1 : 1));

test('refresh reads the vault paths only, never opening other folders; null while nothing changed', async () => {
  opened.length = 0;
  const b = folderBackend(vault());
  const h = (await b.refresh())!;
  expect(paths(h)).toEqual(['Home.md', 'daily/2026-10-03.md', 'meta/conventions.md']);
  expect(sorted(opened)).toEqual(['daily', 'meta', 'vault']);
  expect(await b.refresh()).toBeNull();
});

test('write verifies, then writes and deletes; the new head comes back and counts as seen', async () => {
  const root = vault();
  const b = folderBackend(root);
  const before = (await b.refresh())!;
  let verified: string[][] = [];
  const r = await b.write!(
    [
      { path: 'captures/x.md', text: '# X' },
      { path: 'Home.md', text: '# Home 2' },
      { path: 'daily/2026-10-03.md', text: null },
    ],
    'm',
    (a, z) => {
      verified = [a.map((f) => f.path), z.map((f) => f.path)];
      return Promise.resolve();
    },
  );
  expect(verified[0]).toEqual(paths(before));
  expect(sorted(verified[1])).toEqual(['Home.md', 'captures/x.md', 'meta/conventions.md']);
  expect(r.head.files.find((f) => f.path === 'Home.md')?.text).toBe('# Home 2');
  expect(r.head.version).not.toBe(before.version);
  expect(r.commit).toMatch(/^folder-/);
  expect(await b.refresh()).toBeNull();
  expect(sorted(paths((await folderBackend(root).refresh())!))).toEqual([
    'Home.md',
    'captures/x.md',
    'meta/conventions.md',
  ]);
});

test('a refused verify writes nothing', async () => {
  const root = vault();
  const b = folderBackend(root);
  await b.refresh();
  await expect(
    b.write!([{ path: 'Home.md', text: 'broken' }], 'm', () => Promise.reject(new Error('no'))),
  ).rejects.toThrow('no');
  expect((await folderBackend(root).refresh())!.files.find((f) => f.path === 'Home.md')?.text).toBe(
    '# Home',
  );
});

test('a file changed on disk since the last head is a conflict; a path outside the vault is refused', async () => {
  const root = vault();
  const b = folderBackend(root);
  await b.refresh();
  const other = folderBackend(root);
  await other.refresh();
  await other.write!([{ path: 'Home.md', text: '# Elsewhere' }], 'm', ok);
  await expect(b.write!([{ path: 'Home.md', text: '# Mine' }], 'm', ok)).rejects.toThrow(Conflict);
  expect((await b.refresh())!.files.find((f) => f.path === 'Home.md')?.text).toBe('# Elsewhere');
  await expect(b.write!([{ path: 'site/x.md', text: 'x' }], 'm', ok)).rejects.toThrow(
    'not vault files',
  );
});

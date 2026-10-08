// The vault as a folder on this device, through the File System Access API: no server, no Node. The user
// picks the vault root once; the handle is kept in IndexedDB, so a reload reopens it (after a click when
// the browser asks again). Chromium only: Safari and Firefox have no showDirectoryPicker, which is why
// GitHub (backends/github) stays the main backend. A folder has no history: a write goes straight to the
// files (commit with git there). Keep is localStorage, unencrypted like the files themselves.
import { isVaultPath } from '../../core/vault.ts';
import { blobSha } from '../../core/blob-sha.ts';
import { Conflict, type Head, type VaultBackend } from '../shell/backend.ts';
import { applyOverlay } from '../shell/writer.ts';

// The parts of the API used here (TypeScript's DOM lib lacks iteration, permissions and the picker).
interface Mode {
  mode: 'readwrite';
}
export interface FileEntry {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (text: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}
export interface Folder {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<FileEntry | Folder>;
  getDirectoryHandle: (name: string, o?: { create?: boolean }) => Promise<Folder>;
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<FileEntry>;
  removeEntry: (name: string) => Promise<void>;
  queryPermission?: (o: Mode) => Promise<PermissionState>;
  requestPermission?: (o: Mode) => Promise<PermissionState>;
}

// Only these are opened: node_modules, .git and any other folder are never read.
const DIRS = ['', 'daily', 'captures', 'meta'];
const POLL = 3000;
const RW: Mode = { mode: 'readwrite' };
const KEEP = 'vault-folder:';

export function folderBackend(root: Folder): VaultBackend {
  let texts = new Map<string, { stamp: string; text: string }>();
  let seen = '';
  let last = new Map<string, string>();
  const dir = (d: string, create = false) =>
    d ? root.getDirectoryHandle(d, { create }) : Promise.resolve(root);

  // Every vault file; only those whose modified time or size moved are read again.
  const read = async (): Promise<Head> => {
    const found: [string, FileEntry][] = [];
    await Promise.all(
      DIRS.map(async (d) => {
        const h = await dir(d).catch(() => null);
        if (h)
          for await (const e of h.values())
            if (e.kind === 'file' && isVaultPath(d ? `${d}/${e.name}` : e.name))
              found.push([d ? `${d}/${e.name}` : e.name, e]);
      }),
    );
    found.sort(([a], [b]) => (a < b ? -1 : 1));
    texts = new Map(
      await Promise.all(
        found.map(async ([path, e]) => {
          const f = await e.getFile();
          const stamp = `${f.lastModified}:${f.size}`;
          const had = texts.get(path);
          return [path, had?.stamp === stamp ? had : { stamp, text: await f.text() }] as const;
        }),
      ),
    );
    const files = [...texts].map(([path, { text }]) => ({ path, text }));
    return {
      files,
      version: await blobSha([...texts].map(([p, { stamp }]) => `${p}:${stamp}`).join('\n')),
    };
  };
  const give = (h: Head) => {
    seen = h.version;
    last = new Map(h.files.map((f) => [f.path, f.text]));
    return h;
  };

  return {
    cached: async () => null,
    refresh: async () => {
      const h = await read();
      return h.version === seen ? null : give(h);
    },
    watch(on) {
      const Observer = (globalThis as any).FileSystemObserver;
      if (Observer) {
        const o = new Observer(() => on());
        for (const d of DIRS)
          dir(d).then(
            (h) => o.observe(h),
            () => {
              // Not there (yet): nothing to observe in it.
            },
          );
        return () => o.disconnect();
      }
      let busy = false;
      const t = setInterval(async () => {
        if (busy || document.visibilityState !== 'visible') return;
        busy = true;
        try {
          if ((await read()).version !== seen) on();
        } finally {
          busy = false;
        }
      }, POLL);
      return () => clearInterval(t);
    },
    async write(changes, _message, verify) {
      const bad = changes.filter((c) => !isVaultPath(c.path)).map((c) => c.path);
      if (bad.length) throw new Error(`not vault files: ${bad.join(', ')}`);
      const now = await read();
      const stale = changes
        .filter(
          (c) =>
            (now.files.find((f) => f.path === c.path)?.text ?? null) !== (last.get(c.path) ?? null),
        )
        .map((c) => c.path);
      if (stale.length) throw new Conflict(stale);
      await verify(
        now.files,
        applyOverlay(now.files, {
          version: 0,
          from: {},
          files: Object.fromEntries(changes.map((c) => [c.path, c.text])),
        }),
      );
      for (const { path, text } of changes) {
        const i = path.lastIndexOf('/');
        // biome-ignore lint/performance/noAwaitInLoops: one write at a time, in order: a folder made for one file is there for the next
        const d = await dir(path.slice(0, Math.max(i, 0)), text !== null);
        const name = path.slice(i + 1);
        if (text === null) {
          await d.removeEntry(name).catch((e) => {
            if (e.name !== 'NotFoundError') throw e;
          });
          continue;
        }
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
      }
      return { head: give(await read()), commit: `folder-${Date.now().toString(36)}` };
    },
    history: null,
    patch: null,
    revert: null,
    keep: {
      get: async <T>(k: string) => JSON.parse(localStorage.getItem(KEEP + k) ?? 'null') as T | null,
      set(k, v) {
        if (v == null) localStorage.removeItem(KEEP + k);
        else
          try {
            localStorage.setItem(KEEP + k, JSON.stringify(v));
          } catch {
            /* full: it is only a cache, or a draft */
          }
        return Promise.resolve();
      },
    },
  };
}

/* ---------- Which folder: picked, kept in IndexedDB, permitted ---------- */

export const canPickFolder = () => 'showDirectoryPicker' in globalThis;

const saved = async (mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest) => {
  const db = await new Promise<IDBDatabase>((ok, fail) => {
    const r = indexedDB.open('vault-folder', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handle');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  const r = f(db.transaction('handle', mode).objectStore('handle'));
  return new Promise<any>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }).finally(() => db.close());
};

/** The folder picked last on this device, if any. */
export const savedFolder = async (): Promise<Folder | null> =>
  (await saved('readonly', (s) => s.get('root'))) ?? null;

/** Asks the user for the vault root (a user gesture) and keeps it. */
export async function pickFolder(): Promise<Folder> {
  const root: Folder = await (globalThis as any).showDirectoryPicker({
    id: 'vault',
    mode: 'readwrite',
  });
  await saved('readwrite', (s) => s.put(root, 'root'));
  return root;
}

/** Whether the folder may be read and written now; `ask` prompts, which needs a user gesture. */
export const permitted = async (root: Folder, ask = false) =>
  ((await root.queryPermission?.(RW)) ?? 'granted') === 'granted' ||
  (ask && (await root.requestPermission?.(RW)) === 'granted');

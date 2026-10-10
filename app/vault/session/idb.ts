// A small IndexedDB database: named stores, one transaction at a time, nothing about what is kept in it.
// The platform keeps its keys in one (unlock.ts); a backend its cache in another.

export interface Db<S extends string> {
  /** Runs `f` in one transaction over `stores`; resolves when it commits. */
  tx: <T>(
    stores: S[],
    mode: IDBTransactionMode,
    f: (t: IDBTransaction) => T | Promise<T>,
  ) => Promise<T>;
  get: <T>(store: S, key: IDBValidKey) => Promise<T | undefined>;
  getAll: <T>(store: S) => Promise<T[]>;
  put: (store: S, value: unknown) => Promise<IDBValidKey>;
  del: (store: S, key: IDBValidKey) => Promise<undefined>;
  clear: (stores: S[]) => Promise<void>;
  /** For tests: forget the open connection. */
  close: () => Promise<void>;
}

export const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

/** `stores`: name -> key path. An upgrade (a new `version`) drops every store but those in `keep` and
 * makes the rest anew, so what isn't kept is a cache the next use refills. */
export function database<S extends string>(
  name: string,
  version: number,
  stores: Record<S, string>,
  keep: S[] = [],
): Db<S> {
  let db: Promise<IDBDatabase> | undefined;
  const open = () => {
    db ??= new Promise((ok, fail) => {
      const r = indexedDB.open(name, version);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of [...d.objectStoreNames])
          if (!(keep as string[]).includes(s)) d.deleteObjectStore(s);
        for (const [s, keyPath] of Object.entries(stores) as [S, string][])
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    return db;
  };
  const tx: Db<S>['tx'] = async (names, mode, f) => {
    const t = (await open()).transaction(names, mode);
    const committed = new Promise<void>((ok, fail) => {
      t.oncomplete = () => ok();
      t.onerror = () => fail(t.error);
      t.onabort = () => fail(t.error);
    });
    const out = await f(t);
    await committed;
    return out;
  };
  return {
    tx,
    get: (s, key) => tx([s], 'readonly', (t) => done(t.objectStore(s).get(key))),
    getAll: (s) => tx([s], 'readonly', (t) => done(t.objectStore(s).getAll())),
    put: (s, value) => tx([s], 'readwrite', (t) => done(t.objectStore(s).put(value))),
    del: (s, key) => tx([s], 'readwrite', (t) => done(t.objectStore(s).delete(key))),
    clear: (names) =>
      tx(names, 'readwrite', async (t) => {
        await Promise.all(names.map((s) => done(t.objectStore(s).clear())));
      }),
    close: async () => {
      if (db !== undefined) (await db).close();
      db = undefined;
    },
  };
}

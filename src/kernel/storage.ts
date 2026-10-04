// Every extension's own storage, kept by the kernel in one IndexedDB database: a namespace per
// extension, dropped when the extension is removed.
export interface KernelStorage {
  get: (ns: string, key: string) => Promise<unknown>;
  set: (ns: string, key: string, value: unknown) => Promise<void>;
  delete: (ns: string, key: string) => Promise<void>;
  list: (ns: string, prefix: string) => Promise<[string, unknown][]>;
  drop: (ns: string) => Promise<void>;
}

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

const END = '￿';

/** In IndexedDB, keyed by [namespace, key]. */
export function idbStorage(name = 'pip-data'): KernelStorage {
  let db: Promise<IDBDatabase> | undefined;
  const store = async (mode: IDBTransactionMode) => {
    db ??= new Promise((ok, fail) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('data');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    return (await db).transaction('data', mode).objectStore('data');
  };
  const range = (ns: string, prefix: string) => IDBKeyRange.bound([ns, prefix], [ns, prefix + END]);
  return {
    get: async (ns, key) => done((await store('readonly')).get([ns, key])),
    async set(ns, key, value) {
      await done((await store('readwrite')).put(value, [ns, key]));
    },
    async delete(ns, key) {
      await done((await store('readwrite')).delete([ns, key]));
    },
    async list(ns, prefix) {
      const s = await store('readonly');
      const r = range(ns, prefix);
      const [keys, values] = await Promise.all([done(s.getAllKeys(r)), done(s.getAll(r))]);
      return keys.map((k, i) => [(k as [string, string])[1], values[i]]);
    },
    async drop(ns) {
      await done((await store('readwrite')).delete(range(ns, '')));
    },
  };
}

/** In memory, for tests. */
export function memoryStorage(): KernelStorage {
  const m = new Map<string, Map<string, unknown>>();
  const of = (ns: string) => {
    if (!m.has(ns)) m.set(ns, new Map());
    return m.get(ns)!;
  };
  return {
    get: (ns, key) => Promise.resolve(structuredClone(of(ns).get(key))),
    set: (ns, key, value) => Promise.resolve(void of(ns).set(key, structuredClone(value))),
    delete: (ns, key) => Promise.resolve(void of(ns).delete(key)),
    list: (ns, prefix) =>
      Promise.resolve(
        [...of(ns)]
          .filter(([k]) => k.startsWith(prefix))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => [k, structuredClone(v)] as [string, unknown]),
      ),
    drop: (ns) => Promise.resolve(void m.delete(ns)),
  };
}

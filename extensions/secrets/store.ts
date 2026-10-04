// The secrets extension's own database in this browser: one IndexedDB object store of keys and values
// (the device key, each secret encrypted under it, what was opened of the sealed file).
export interface Store {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  /** Entries whose key starts with `prefix`, in key order. */
  list: <T>(prefix?: string) => Promise<[string, T][]>;
}

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

export function idbStore(name = 'secrets'): Store {
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
  return {
    get: async <T>(key: string) => done<T | undefined>((await store('readonly')).get(key)),
    async set(key, value) {
      await done((await store('readwrite')).put(value, key));
    },
    async delete(key) {
      await done((await store('readwrite')).delete(key));
    },
    async list<T>(prefix = '') {
      const s = await store('readonly');
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const [keys, values] = await Promise.all([done(s.getAllKeys(range)), done(s.getAll(range))]);
      return keys.map((k, i) => [String(k), values[i] as T] as [string, T]);
    },
  };
}

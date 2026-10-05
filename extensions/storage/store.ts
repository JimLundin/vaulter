// A database of its own in this browser: one IndexedDB object store of
// keys and values. Records keep theirs in "storage", secrets in "secrets".

export interface Store {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  /** Entries whose key starts with `prefix`, in key order. */
  list: <T>(prefix: string) => Promise<[string, T][]>;
}

function settled<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** The database `name`, opened on first use. */
export function idbStore(name: string): Store {
  let database: Promise<IDBDatabase> | undefined;

  async function objects(mode: IDBTransactionMode) {
    database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return (await database).transaction('data', mode).objectStore('data');
  }

  return {
    async get<T>(key: string) {
      return settled<T | undefined>((await objects('readonly')).get(key));
    },
    async set(key, value) {
      await settled((await objects('readwrite')).put(value, key));
    },
    async list<T>(prefix: string) {
      const store = await objects('readonly');
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const [keys, values] = await Promise.all([
        settled(store.getAllKeys(range)),
        settled(store.getAll(range)),
      ]);
      return keys.map((key, i): [string, T] => [String(key), values[i] as T]);
    },
  };
}

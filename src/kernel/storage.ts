// The kernel's own state: settings, trees and compiled output, the error log. It
// is the kernel's alone, in a database of its own, because the kernel needs it before any extension
// has loaded and safe mode needs it when none works. Extensions keep their data through records@1,
// whose provider owns its own storage.
export interface KernelKeep {
  get: <T>(id: string) => Promise<T | undefined>;
  set: (id: string, value: unknown) => Promise<void>;
  del: (id: string) => Promise<void>;
}

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

/** In IndexedDB, in the browser. */
export function idbKeep(): KernelKeep {
  let db: Promise<IDBDatabase> | undefined;
  const store = async (mode: IDBTransactionMode) => {
    db ??= new Promise((ok, fail) => {
      const r = indexedDB.open('vaulter-kernel', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keep');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    return (await db).transaction('keep', mode).objectStore('keep');
  };
  return {
    get: async <T>(id: string) => done<T | undefined>((await store('readonly')).get(id)),
    set: async (id, value) => {
      await done((await store('readwrite')).put(value, id));
    },
    del: async (id) => {
      await done((await store('readwrite')).delete(id));
    },
  };
}

/** In memory, for tests. */
export function memoryKeep(): KernelKeep {
  const m = new Map<string, unknown>();
  return {
    get: <T>(id: string) => Promise.resolve(m.get(id) as T | undefined),
    set: (id, v) => {
      m.set(id, v);
      return Promise.resolve();
    },
    del: (id) => {
      m.delete(id);
      return Promise.resolve();
    },
  };
}

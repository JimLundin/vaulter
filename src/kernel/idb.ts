// The kernel's own IndexedDB database, apart from any extension's storage: the device key and the
// sealed secrets now; the chosen commit and the compiled-extension cache later.
import type { KernelKeep } from './secrets.ts';

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

export function idbKeep(name = 'pip-kernel'): KernelKeep {
  let db: Promise<IDBDatabase> | undefined;
  const open = () => {
    db ??= new Promise((ok, fail) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keep');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    return db;
  };
  const store = async (mode: IDBTransactionMode) =>
    (await open()).transaction('keep', mode).objectStore('keep');
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

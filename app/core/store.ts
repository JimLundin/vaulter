// The app's IndexedDB database. Raw file text only, never parsed notes (PLAN-browser-app.md, phase 4):
//   blobs     sha -> { sha, iv, data }               a file version, AES-GCM with the cache key, AAD = sha
//   snapshot  'main' -> { id, commit, tree, etag, fetchedAt, iv, data }   data: { path: sha }, encrypted
//   keep      key -> { id, iv, data }                                    the app's own state (staged edits, worker results)
//   keys      'device' -> { id, key, salt, cacheKey, expires }            what unlocking remembers
//             'dev' -> { id, cacheKey }                                  dev's cache key (no password)
// Every store but keys is a cache: a schema change bumps VERSION and clears them; the next sync refills.

const NAME = 'vault';
const VERSION = 3;
export type StoreName = 'blobs' | 'snapshot' | 'keep' | 'keys';
const CACHES: StoreName[] = ['blobs', 'snapshot', 'keep'];

let db: Promise<IDBDatabase> | undefined;

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

function openDb(): Promise<IDBDatabase> {
  db ??= new Promise((ok, fail) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of [...d.objectStoreNames]) if (s !== 'keys') d.deleteObjectStore(s);
      d.createObjectStore('blobs', { keyPath: 'sha' });
      d.createObjectStore('snapshot', { keyPath: 'id' });
      d.createObjectStore('keep', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('keys')) d.createObjectStore('keys', { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  return db;
}

/** Runs `f` in one transaction over `stores`; resolves when it commits. */
export async function tx<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  f: (t: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const t = (await openDb()).transaction(stores, mode);
  const committed = new Promise<void>((ok, fail) => {
    t.oncomplete = () => ok();
    t.onerror = () => fail(t.error);
    t.onabort = () => fail(t.error);
  });
  const out = await f(t);
  await committed;
  return out;
}

export const get = <T>(store: StoreName, key: IDBValidKey) =>
  tx([store], 'readonly', (t) => done<T | undefined>(t.objectStore(store).get(key)));
export const getAll = <T>(store: StoreName) =>
  tx([store], 'readonly', (t) => done<T[]>(t.objectStore(store).getAll()));
export const put = (store: StoreName, value: unknown) =>
  tx([store], 'readwrite', (t) => done(t.objectStore(store).put(value)));
export const del = (store: StoreName, key: IDBValidKey) =>
  tx([store], 'readwrite', (t) => done(t.objectStore(store).delete(key)));
export const clearCaches = () =>
  tx(CACHES, 'readwrite', (t) => Promise.all(CACHES.map((s) => done(t.objectStore(s).clear()))));

/** For tests: forget the open connection. */
export const closeDb = async () => {
  if (db !== undefined) (await db).close();
  db = undefined;
};

/* ---------- Encryption at rest, with the cache key ---------- */

export interface Encrypted {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

export const newCacheKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

/** `aad` binds the ciphertext to where it is stored (a blob's sha, "snapshot"), so a record moved elsewhere fails to open. */
export async function encrypt(
  key: CryptoKey,
  bytes: Uint8Array<ArrayBuffer>,
  aad: string,
): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    iv,
    data: await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
      key,
      bytes,
    ),
  };
}

export async function decrypt(
  key: CryptoKey,
  e: Encrypted,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: e.iv, additionalData: new TextEncoder().encode(aad) },
      key,
      e.data,
    ),
  );
}

export const encryptJson = (key: CryptoKey, v: unknown, aad: string) =>
  encrypt(key, new TextEncoder().encode(JSON.stringify(v)), aad);
/** The app's own state, encrypted with the cache key: `keep(key)` gives the backend's `keep`. */
export const keepWith = (key: CryptoKey) => ({
  async get<T>(id: string): Promise<T | null> {
    const rec = await get<Encrypted & { id: string }>('keep', id);
    if (!rec) return null;
    try {
      return await decryptJson<T>(key, rec, `keep:${id}`);
    } catch {
      return null;
    }
  },
  async set(id: string, value: unknown) {
    if (value == null) await del('keep', id);
    else await put('keep', { id, ...(await encryptJson(key, value, `keep:${id}`)) });
  },
});

export const decryptJson = async <T>(key: CryptoKey, e: Encrypted, aad: string): Promise<T> =>
  JSON.parse(new TextDecoder().decode(await decrypt(key, e, aad)));

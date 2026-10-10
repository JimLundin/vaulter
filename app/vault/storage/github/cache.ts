// The GitHub backend's cache on this device, in its own IndexedDB database, every record encrypted with
// the cache key (app/vault/session/crypto.ts). Raw file text only, never parsed notes:
//   blobs     sha -> { sha, iv, data }               a file version, AAD = sha
//   snapshot  'main' -> { id, commit, tree, etag, fetchedAt, iv, data }   data: { path: sha }
//   keep      key -> { id, iv, data }                the app's own state (staged edits, worker results)
//   owner     'key' -> { id, iv, data }              proof of which cache key wrote the rest (claim)
// All of it is a cache: a new VERSION drops it, and the next sync refills it.
import { database } from '../../session/idb.ts';
import { decryptJson, encryptJson, type Encrypted } from '../../session/crypto.ts';

const VERSION = 1;
export const db = database('vault-github', VERSION, {
  blobs: 'sha',
  snapshot: 'id',
  keep: 'id',
  owner: 'id',
});

/** Everything here, gone: signing out, or a cache another key wrote. */
export const clear = () => db.clear(['blobs', 'snapshot', 'keep', 'owner']);

/** Makes the cache this key's: if another key wrote it (a new unlock, a re-seal), it can't be read, so it
 * is cleared first; a blob kept under another key would otherwise count as cached and never read back. */
export async function claim(key: CryptoKey) {
  const rec = await db.get<Encrypted & { id: string }>('owner', 'key');
  if (rec) {
    try {
      await decryptJson(key, rec, 'owner');
      return;
    } catch {
      // another key's
    }
  }
  await clear();
  await db.put('owner', { id: 'key', ...(await encryptJson(key, 'mine', 'owner')) });
}

/** The app's own state, encrypted with the cache key: the backend's `keep`. */
export const keepWith = (key: CryptoKey) => ({
  async get<T>(id: string): Promise<T | null> {
    const rec = await db.get<Encrypted & { id: string }>('keep', id);
    if (!rec) return null;
    try {
      return await decryptJson<T>(key, rec, `keep:${id}`);
    } catch {
      return null;
    }
  },
  async set(id: string, value: unknown) {
    if (value == null) await db.del('keep', id);
    else await db.put('keep', { id, ...(await encryptJson(key, value, `keep:${id}`)) });
  },
});

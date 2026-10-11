// Plaintext file and application-state cache.
import { database } from '../../session/idb.ts';

const VERSION = 2;
export const db = database('vault-github', VERSION, {
  blobs: 'sha',
  snapshot: 'id',
  keep: 'id',
});

/** Signing out removes all device contents. */
export const clear = () => db.clear(['blobs', 'snapshot', 'keep']);

/** Application state, including staged edits. */
export const kept = {
  async get<T>(id: string): Promise<T | null> {
    const rec = await db.get<{ id: string; value: T }>('keep', id);
    return rec?.value ?? null;
  },
  async set(id: string, value: unknown) {
    if (value == null) await db.del('keep', id);
    else await db.put('keep', { id, value });
  },
};

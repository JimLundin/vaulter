// Encrypted, repository-scoped Dexie cache. The unlocked session owns the key; none is stored here.
import { Dexie } from 'dexie';
import { encryptJson, decryptJson, type Encrypted } from '../../session/crypto.ts';
import { digest } from '../../nodes/json.ts';
import { parseRecord, type NodeRecord } from '../../nodes/validation.ts';
import { validateRecords } from '../../nodes/history.ts';

export interface RemoteHead {
  readonly commit: string;
  readonly tree: string;
  readonly etag: string;
  readonly files: Readonly<Record<string, string>>;
}
interface CachedRecord extends Encrypted {
  id: string;
}

export async function nodeCache(key: CryptoKey, scope: string) {
  const name = `vaulter-nodes-${await digest(scope)}`;
  const db = new Dexie(name);
  db.version(1).stores({ envelopes: 'id', head: 'id', owner: 'id' });
  const envelopes = db.table<CachedRecord, string>('envelopes');
  const head = db.table<CachedRecord, string>('head');
  const owner = db.table<CachedRecord, string>('owner');
  const aad = (value: string) => `${scope}:${value}`;
  const marker = await owner.get('key');
  let matches = false;
  if (marker) {
    try {
      matches = (await decryptJson(key, marker, aad('owner'))) === scope;
    } catch {
      /* Another unlock owns this cache. */
    }
  }
  if (!matches) {
    const proof = { id: 'key', ...(await encryptJson(key, scope, aad('owner'))) };
    await db.transaction('rw', [envelopes, head, owner], async () => {
      await envelopes.clear();
      await head.clear();
      await owner.clear();
      await owner.add(proof);
    });
  }
  return {
    async read(): Promise<{ head: RemoteHead; records: readonly NodeRecord[] } | null> {
      const saved = await db.transaction('r', [head, envelopes], async () => ({
        head: await head.get('main'),
        records: await envelopes.toArray(),
      }));
      if (!saved.head) return null;
      const remote = await decryptJson<RemoteHead>(key, saved.head, aad('head'));
      const values = await Promise.all(
        saved.records.map(async (row) => {
          const record = parseRecord(await decryptJson(key, row, aad(`transaction:${row.id}`)));
          if (record.transaction.id !== row.id) throw new Error('Cached transaction key mismatch');
          return record;
        }),
      );
      return {
        head: remote,
        records: validateRecords(
          values.sort((a, b) => a.transaction.sequence - b.transaction.sequence),
        ),
      };
    },
    async write(remote: RemoteHead, values: readonly NodeRecord[]) {
      const known = new Set(await envelopes.toCollection().primaryKeys());
      const rows = await Promise.all(
        values
          .filter((value) => !known.has(value.transaction.id))
          .map(
            async (value): Promise<CachedRecord> => ({
              id: value.transaction.id,
              ...(await encryptJson(key, value, aad(`transaction:${value.transaction.id}`))),
            }),
          ),
      );
      const saved = { id: 'main', ...(await encryptJson(key, remote, aad('head'))) };
      // Crypto completes before this short transaction. Log and head change atomically.
      await db.transaction('rw', [head, envelopes], async () => {
        if (rows.length) await envelopes.bulkAdd(rows);
        await head.put(saved);
      });
    },
    clear: () =>
      db.transaction('rw', [head, envelopes], async () => {
        await head.clear();
        await envelopes.clear();
      }),
    close: () => db.close(),
  };
}

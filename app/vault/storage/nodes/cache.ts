// Plaintext, repository-scoped Dexie cache.
import { Dexie } from 'dexie';
import { digest } from '../../nodes/json.ts';
import { parseRecord, type NodeRecord } from '../../nodes/validation.ts';
import { validateRecords } from '../../nodes/history.ts';

export interface RemoteHead {
  readonly commit: string;
  readonly tree: string;
  readonly etag: string;
  readonly files: Readonly<Record<string, string>>;
}
interface CachedRecord {
  id: string;
  value: unknown;
}

export async function nodeCache(scope: string) {
  const name = `vaulter-nodes-${await digest(scope)}`;
  const db = new Dexie(name);
  db.version(2)
    .stores({ envelopes: 'id', head: 'id', owner: null })
    .upgrade(async (transaction) => {
      await transaction.table('envelopes').clear();
      await transaction.table('head').clear();
    });
  const envelopes = db.table<CachedRecord, string>('envelopes');
  const head = db.table<CachedRecord, string>('head');
  return {
    async read(): Promise<{ head: RemoteHead; records: readonly NodeRecord[] } | null> {
      const saved = await db.transaction('r', [head, envelopes], async () => ({
        head: await head.get('main'),
        records: await envelopes.toArray(),
      }));
      if (!saved.head) return null;
      const remote = saved.head.value as RemoteHead;
      const values = saved.records.map((row) => {
        const record = parseRecord(row.value);
        if (record.transaction.id !== row.id) throw new Error('Cached transaction key mismatch');
        return record;
      });
      return {
        head: remote,
        records: validateRecords(
          values.sort((a, b) => a.transaction.sequence - b.transaction.sequence),
        ),
      };
    },
    async write(remote: RemoteHead, values: readonly NodeRecord[]) {
      const known = new Set(await envelopes.toCollection().primaryKeys());
      const rows: CachedRecord[] = values
        .filter((value) => !known.has(value.transaction.id))
        .map((value) => ({ id: value.transaction.id, value }));
      const saved = { id: 'main', value: remote };
      // Log and head change atomically.
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

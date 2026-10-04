// records@1 over IndexedDB: one object store for every type, keyed by [type, id], indexed by type.
// Queries read a type's records and filter in memory, which is plenty for one person's notes.
import { type Meta, type Rec, type RecordsV1, recordType } from '@contracts/records';
import type { z } from 'zod';

type Stored = Meta & Record<string, unknown>;

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

export function openDb(name = 'pip-records'): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('records', { keyPath: ['type', 'id'] });
      s.createIndex('type', 'type');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

type Listener = (rec: Stored) => void;

/** One provider for the whole app; `forCaller` gives each extension its view, namespaced by its id. */
export function idbRecords(db: Promise<IDBDatabase>) {
  const listeners = new Map<string, Set<Listener>>();
  // Each record created after the one before, even within a millisecond, so "newest first" holds.
  let last = 0;
  const stamp = () => {
    last = Math.max(Date.now(), last + 1);
    return new Date(last).toISOString();
  };
  const store = async (mode: IDBTransactionMode) =>
    (await db).transaction('records', mode).objectStore('records');
  const all = async (type: string) =>
    done<Stored[]>((await store('readonly')).index('type').getAll(type));

  return (caller: string): RecordsV1 => ({
    registerType: (name, fields) => recordType(`${caller}/${name}`, fields),

    get: async (type, id) =>
      (await done<Stored | undefined>((await store('readonly')).get([type.name, id]))) as never,

    async query(type, where = {}) {
      let out = await all(type.name);
      if (where.since) out = out.filter((r) => r.created >= where.since!);
      out.sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
      if (where.order !== 'oldest') out.reverse();
      return out.slice(0, where.limit) as never;
    },

    async search(types, text) {
      const words = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const found = (await Promise.all(types.map((t) => all(t.name)))).flat();
      return found.filter((r) => {
        const hay = Object.values(r)
          .filter((v) => typeof v === 'string')
          .join(' ')
          .toLocaleLowerCase();
        return words.every((w) => hay.includes(w));
      }) as never;
    },

    async put(type, value) {
      const { id, ...fields } = value as { id?: string } & Record<string, unknown>;
      const data = type.schema.parse(fields) as Record<string, unknown>;
      const s = await store('readwrite');
      const prior = id ? await done<Stored | undefined>(s.get([type.name, id])) : undefined;
      const now = stamp();
      const rec: Stored = {
        ...data,
        id: id ?? crypto.randomUUID(),
        type: type.name,
        created: prior?.created ?? now,
        updated: now,
      };
      await done(s.put(rec));
      for (const l of listeners.get(type.name) ?? []) l(rec);
      return rec as Rec<z.ZodRawShape> as never;
    },

    onChanged(type, handler) {
      const set = listeners.get(type.name) ?? new Set();
      listeners.set(type.name, set);
      const l = handler as Listener;
      set.add(l);
      return () => set.delete(l);
    },
  });
}

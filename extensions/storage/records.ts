// Records over storage's own database (store.ts: IndexedDB in the browser). Keys:
//   r:<type>:<id>                a record as it is now, a tombstone included
//   h:<type>:<id>:<rev>          each earlier revision of it
// Each value is checked and shaped by its type's own Zod, given at registration on this start. Queries
// read a type's records and filter in memory: plenty for one person's data. Changes to one record run
// one after another (this page is the only one with the kernel), so an update always starts from the
// last.

import { z } from 'zod';
import type { Filter, Query, Records, RecordType, Stored } from './api.ts';
import type { Store } from './store.ts';

const words = (s: string) =>
  s
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const matches = (v: unknown, f: Filter) => {
  if (f === null || typeof f !== 'object') return v === f;
  if (v === undefined || v === null) return false;
  return (
    (f.gte == null || (v as never) >= (f.gte as never)) &&
    (f.lt == null || (v as never) < (f.lt as never))
  );
};

const fieldsOf = ({ id: _, meta: _m, ...fields }: Stored) => fields;

/** Records by a field or when, in `dir` (1 up, -1 down); ties by when created, and records without
 * the field last either way. */
const ordered = (by: string, dir: 1 | -1) => {
  const key = (r: Stored) =>
    by === 'created' || by === 'updated' ? r.meta[by] : (r[by] as string | number | undefined);
  return (a: Stored, b: Stored) => {
    const [x, y] = [key(a), key(b)];
    if (x === y) return dir * a.meta.created.localeCompare(b.meta.created);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return dir * (x < y ? -1 : 1);
  };
};

export function localRecords(storage: Store) {
  // Each change made after the one before, even within a millisecond, so "latest first" holds.
  let last = 0;
  const stamp = () => {
    last = Math.max(Date.now(), last + 1);
    return new Date(last).toISOString();
  };
  // One change at a time per record: the next waits for the one before.
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, f: () => Promise<T>): Promise<T> => {
    const next = (queues.get(key) ?? Promise.resolve()).then(f, f);
    queues.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  };
  const all = async (type: string) => (await storage.list<Stored>(`r:${type}:`)).map(([, r]) => r);
  const current = (type: string, id: string) => storage.get<Stored>(`r:${type}:${id}`);
  /** Writes the next revision of `rec`, keeping the one it replaces. */
  const write = async (type: string, prior: Stored | undefined, next: Stored) => {
    if (prior)
      await storage.set(`h:${type}:${prior.id}:${String(prior.meta.rev).padStart(9, '0')}`, prior);
    await storage.set(`r:${type}:${next.id}`, next);
    return next;
  };
  const revise = (
    prior: Stored,
    fields: Record<string, unknown>,
    meta: Partial<Stored['meta']> = {},
  ) =>
    ({
      ...fields,
      id: prior.id,
      meta: { ...prior.meta, updated: stamp(), rev: prior.meta.rev + 1, ...meta },
    }) as Stored;

  // Each type's Zod, from its registration on this start.
  const zods = new Map<string, z.ZodType>();
  const zodOf = (type: string) => {
    const zod = zods.get(type);
    if (!zod) throw new Error(`no record type "${type}"`);
    return zod;
  };
  /** `fields` checked and shaped by the type's Zod. */
  const shape = (type: string, fields: unknown) => {
    const r = zodOf(type).safeParse(fields);
    if (!r.success)
      throw new Error(
        `${type}: ${r.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ')}`,
      );
    return r.data as Record<string, unknown>;
  };

  const make = (caller: string): Records => {
    /** The type's name, if it is the caller's own to write. */
    const mine = (t: RecordType) => {
      if (!t.name.startsWith(`${caller}/`)) throw new Error(`${caller} may not write ${t.name}`);
      return t.name;
    };
    const get = async (t: RecordType, id: string) => {
      const rec = await current(t.name, id);
      return rec?.meta.deleted ? undefined : rec;
    };

    const impl = {
      registerType(name: string, fields: z.ZodRawShape): Promise<RecordType> {
        const type = `${caller}/${name}`;
        zods.set(type, z.object(fields));
        return Promise.resolve({ kind: 'record-type', name: type });
      },

      get,

      async query(t: RecordType, q: Query = {}) {
        let out = (await all(t.name)).filter((r) => !r.meta.deleted);
        for (const [field, f] of Object.entries(q.where ?? {}))
          out = out.filter((r) => matches(r[field], f));
        out.sort(ordered(q.orderBy ?? 'created', q.order === 'asc' ? 1 : -1));
        return out.slice(0, q.limit);
      },

      async search(types: RecordType[], text: string, opts: { fields?: string[] } = {}) {
        const want = words(text);
        const found = (await Promise.all(types.map((t) => all(t.name))))
          .flat()
          .filter((r) => !r.meta.deleted);
        const hit = found.filter((r) => {
          const values = opts.fields ? opts.fields.map((f) => r[f]) : Object.values(fieldsOf(r));
          const hay = words(
            values
              .flatMap((v) => (Array.isArray(v) ? v : [v]))
              .filter((v) => typeof v === 'string')
              .join(' '),
          ).join(' ');
          return want.every((w) => hay.includes(w));
        });
        hit.sort((a, b) => b.meta.created.localeCompare(a.meta.created));
        return hit;
      },

      async create(t: RecordType, value: Record<string, unknown>) {
        const type = mine(t);
        const { id: asked, ...fields } = value as { id?: string } & Record<string, unknown>;
        const data = shape(type, fields);
        const id = asked ?? crypto.randomUUID();
        return await serial(`${type}:${id}`, async () => {
          if (await current(type, id)) throw new Error(`${type}: a record ${id} exists`);
          const now = stamp();
          return write(type, undefined, {
            ...data,
            id,
            meta: { type, created: now, updated: now, rev: 1 },
          } as Stored);
        });
      },

      async update(
        t: RecordType,
        id: string,
        change: (current: Stored) => unknown | Promise<unknown>,
      ) {
        const type = mine(t);
        zodOf(type);
        return await serial(`${type}:${id}`, async () => {
          const prior = await current(type, id);
          if (!prior || prior.meta.deleted) throw new Error(`${type}: no record ${id}`);
          return write(type, prior, revise(prior, shape(type, await change(prior))));
        });
      },

      async delete(t: RecordType, id: string) {
        const type = mine(t);
        await serial(`${type}:${id}`, async () => {
          const prior = await current(type, id);
          if (!prior || prior.meta.deleted) return;
          await write(type, prior, revise(prior, fieldsOf(prior), { deleted: stamp() }));
        });
      },
    };
    return impl as unknown as Records;
  };

  return make;
}

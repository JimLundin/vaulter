// records@1 over store-local's own database (store.ts: IndexedDB in the browser). Keys:
//   format                       the layout below, so a later store-local can tell what it reads
//   r:<type>:<id>                a record as it is now, a tombstone included
//   h:<type>:<id>:<rev>          each earlier revision of it
// Each value is checked and shaped by its type's own Zod, given at registration on this start. Queries read a type's
// records and filter in memory: plenty for one person's data. Changes to one record run one after
// another (this page is the only one with the kernel), so an update always starts from the last.

import { z } from 'zod';
import type { Filter, Query, RecordsV1, RecordType, Stored } from '#contracts/records';
import type { Store } from './store.ts';

const FORMAT = 2;

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

export async function localRecords(storage: Store) {
  const at = await storage.get<number>('format');
  if (at === undefined) await storage.set('format', FORMAT);
  else if (at !== FORMAT)
    throw new Error(`records are stored in format ${at}; this store-local reads ${FORMAT}`);
  const listeners = new Map<string, Set<(c: Stored) => void>>();
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
  const emit = (type: string, c: Stored) => {
    // After the change is kept, and apart from it: a listener that fails is its own error.
    for (const l of listeners.get(type) ?? []) queueMicrotask(() => l(c));
  };
  const all = async (type: string) => (await storage.list<Stored>(`r:${type}:`)).map(([, r]) => r);
  const current = (type: string, id: string) => storage.get<Stored>(`r:${type}:${id}`);
  /** The record `id` reads as: itself, or the one it was merged into. */
  const resolve = async (type: string, id: string) => {
    let rec = await current(type, id);
    for (let hops = 0; rec?.meta.mergedInto && hops < 50; hops++)
      rec = await current(type, rec.meta.mergedInto);
    return rec;
  };
  /** Writes the next revision of `rec`, keeping the one it replaces. */
  const write = async (type: string, prior: Stored | undefined, next: Stored) => {
    if (prior)
      await storage.set(`h:${type}:${prior.id}:${String(prior.meta.rev).padStart(9, '0')}`, prior);
    await storage.set(`r:${type}:${next.id}`, next);
    emit(type, next);
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

  const make = (caller: string): RecordsV1 => {
    /** The type's name, if it is the caller's own to write. */
    const mine = (t: RecordType) => {
      if (!t.name.startsWith(`${caller}/`)) throw new Error(`${caller} may not write ${t.name}`);
      return t.name;
    };
    const get = async (t: RecordType, id: string, opts: { deleted?: boolean } = {}) => {
      if (opts.deleted) return current(t.name, id);
      const rec = await resolve(t.name, id);
      return rec?.meta.deleted ? undefined : rec;
    };
    const history = async (t: RecordType, id: string) =>
      (await storage.list<Stored>(`h:${t.name}:${id}:`)).map(([, r]) => r).reverse();

    const impl = {
      registerType(name: string, fields: z.ZodRawShape): Promise<RecordType> {
        const type = `${caller}/${name}`;
        zods.set(type, z.object(fields));
        return Promise.resolve({ kind: 'record-type', name: type });
      },

      get,

      async query(t: RecordType, q: Query = {}) {
        let out = (await all(t.name)).filter((r) => q.deleted || !r.meta.deleted);
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
        const target = (await resolve(type, id))?.id ?? id;
        return serial(`${type}:${target}`, async () => {
          const prior = await current(type, target);
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

      async restore(t: RecordType, id: string) {
        const type = mine(t);
        return await serial(`${type}:${id}`, async () => {
          const prior = await current(type, id);
          if (!prior) throw new Error(`${type}: no record ${id}`);
          if (!prior.meta.deleted) return prior;
          return write(
            type,
            prior,
            revise(prior, fieldsOf(prior), { deleted: undefined, mergedInto: undefined }),
          );
        });
      },

      async merge(t: RecordType, keepId: string, mergeId: string) {
        const type = mine(t);
        zodOf(type);
        const [keep, merge] = await Promise.all([get(t, keepId), get(t, mergeId)]);
        if (!(keep && merge)) throw new Error(`${type}: both records must exist to merge`);
        if (keep.id === merge.id) throw new Error(`${type}: a record can't be merged into itself`);
        // The merged record's fields as its queue last left them, so a change still running isn't lost.
        const now = async (id: string) => {
          const rec = await current(type, id);
          if (!rec) throw new Error(`${type}: no record ${id}`);
          return rec;
        };
        const merged = await serial(`${type}:${merge.id}`, async () => {
          const prior = await now(merge.id);
          await write(
            type,
            prior,
            revise(prior, fieldsOf(prior), { deleted: stamp(), mergedInto: keep.id }),
          );
          return fieldsOf(prior);
        });
        return serial(`${type}:${keep.id}`, async () => {
          const prior = await now(keep.id);
          return write(type, prior, revise(prior, shape(type, { ...merged, ...fieldsOf(prior) })));
        });
      },

      history,

      onChanged(t: RecordType, handler: (c: Stored) => void) {
        const set = listeners.get(t.name) ?? new Set();
        listeners.set(t.name, set);
        set.add(handler);
        return Promise.resolve(() => {
          set.delete(handler);
        });
      },
    };
    return impl as unknown as RecordsV1;
  };

  /** Drops every type the caller registered, and their records. */
  const forget = async (caller: string) => {
    for (const prefix of ['r:', 'h:'])
      for (const [key] of await storage.list(`${prefix}${caller}/`)) await storage.delete(key);
  };

  return { make, forget };
}

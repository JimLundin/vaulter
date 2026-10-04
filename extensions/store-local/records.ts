// records@1 over store-local's own database (store.ts: IndexedDB in the browser). Keys:
//   format                       the layout below, so a later store-local can tell what it reads
//   t:<type>                     the type: its version now
//   r:<type>:<id>                a record as it is now, a tombstone included
//   h:<type>:<id>:<rev>          each earlier revision of it
// Each value is checked and shaped by its type's own Zod, given at registration. Queries read a type's
// records and filter in memory: plenty for one person's data. Changes to one record run one after
// another (this page is the only one with the kernel), so an update always starts from the last.
import type {
  Filter,
  Migration,
  Query,
  Range,
  RecordsV1,
  RecordType,
  Stored,
} from '@contracts/records';
import { z } from 'zod';
import type { Store } from './store.ts';

export const FORMAT = 2;

interface TypeEntry {
  version: number;
}

const words = (s: string) =>
  s
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const inRange = (v: unknown, r: Range) =>
  v !== undefined &&
  (r.gt === undefined || (v as never) > (r.gt as never)) &&
  (r.gte === undefined || (v as never) >= (r.gte as never)) &&
  (r.lt === undefined || (v as never) < (r.lt as never)) &&
  (r.lte === undefined || (v as never) <= (r.lte as never));

const matches = (v: unknown, f: Filter) => {
  if (f === null || typeof f !== 'object') return v === f;
  if ('eq' in f && !same(v, f.eq)) return false;
  if (f.in && !f.in.some((x) => same(v, x))) return false;
  if ('has' in f && !(Array.isArray(v) && v.some((x) => same(x, f.has)))) return false;
  const ranged = [f.gt, f.gte, f.lt, f.lte].some((x) => x !== undefined);
  return !ranged || inRange(v, f);
};

const fieldsOf = ({ id: _, meta: _m, ...fields }: Stored) => fields;

export function localRecords(storage: Store) {
  const listeners = new Map<string, Set<(c: Stored) => void>>();
  const format = (async () => {
    const at = await storage.get<number>('format');
    if (at === undefined) await storage.set('format', FORMAT);
    else if (at !== FORMAT)
      throw new Error(`records are stored in format ${at}; this store-local reads ${FORMAT}`);
  })();
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
    for (const l of listeners.get(type) ?? []) void Promise.resolve(l(c)).catch(() => undefined);
  };
  const typeOf = async (type: string) => {
    await format;
    const t = await storage.get<TypeEntry>(`t:${type}`);
    if (!t) throw new Error(`no record type "${type}"`);
    return t;
  };
  const all = async (type: string) => {
    await format;
    return (await storage.list<Stored>(`r:${type}:`)).map(([, r]) => r);
  };
  const current = (type: string, id: string) => storage.get<Stored>(`r:${type}:${id}`);
  /** The record `id` reads as: itself, or the one it was merged into. */
  const resolve = async (type: string, id: string) => {
    let rec = await current(type, id);
    for (let hops = 0; rec?.meta.mergedInto && hops < 50; hops++)
      // biome-ignore lint/performance/noAwaitInLoops: each hop needs the one before
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

  // Each type's Zod, by name and version, from its registration on this start.
  const zods = new Map<string, z.ZodType>();
  /** `fields` checked and shaped by the type's Zod at `version`. */
  const shape = (type: string, version: number, fields: unknown) => {
    const zod = zods.get(`${type}@${version}`);
    if (!zod) throw new Error(`${type} isn't registered at version ${version}`);
    const r = zod.safeParse(fields);
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
      await format;
      if (opts.deleted) return current(t.name, id);
      const rec = await resolve(t.name, id);
      return rec?.meta.deleted ? undefined : rec;
    };
    const history = async (t: RecordType, id: string) => {
      await format;
      return (await storage.list<Stored>(`h:${t.name}:${id}:`)).map(([, r]) => r).reverse();
    };

    const revert = async (t: RecordType, version: number) => {
      const type = mine(t);
      await typeOf(type);
      for (const rec of await all(type)) {
        if (rec.meta.v <= version) continue;
        // The latest revision at that version; a record made since has none, and is put away.
        // biome-ignore lint/performance/noAwaitInLoops: one record at a time
        const earlier = (await history(t, rec.id)).find((h) => h.meta.v <= version);
        await serial(`${type}:${rec.id}`, () =>
          write(
            type,
            rec,
            earlier
              ? revise(rec, fieldsOf(earlier), {
                  v: earlier.meta.v,
                  deleted: earlier.meta.deleted,
                })
              : revise(rec, fieldsOf(rec), { deleted: rec.meta.deleted ?? stamp() }),
          ),
        );
      }
      await storage.set(`t:${type}`, { version } satisfies TypeEntry);
    };

    const impl = {
      async registerType(
        name: string,
        fields: z.ZodRawShape,
        opts: { version?: number; migrate?: Record<number, Migration> } = {},
      ): Promise<RecordType> {
        const type = `${caller}/${name}`;
        const version = opts.version ?? 1;
        const handle: RecordType = { kind: 'record-type', name: type, version };
        zods.set(`${type}@${version}`, z.object(fields));
        await format;
        const prior = await storage.get<TypeEntry>(`t:${type}`);
        if (prior && prior.version > version) {
          await revert(handle, version);
          return handle;
        }
        if (prior && prior.version < version) {
          // Every record up, one version at a time, each step a revision; the version is the new one
          // only once every record has moved, so a migration cut short runs again.
          for (const rec of await all(type)) {
            if (rec.meta.v >= version) continue;
            let data = fieldsOf(rec);
            for (let v = rec.meta.v; v < version; v++) {
              const up = opts.migrate?.[v];
              if (!up) throw new Error(`${type}: no migration from version ${v}`);
              // biome-ignore lint/performance/noAwaitInLoops: each step needs the one before
              data = await up(data);
            }
            const next = shape(type, version, data);
            await serial(`${type}:${rec.id}`, () =>
              write(type, rec, revise(rec, next, { v: version })),
            );
          }
        }
        await storage.set(`t:${type}`, { version } satisfies TypeEntry);
        return handle;
      },

      get,

      async query(t: RecordType, q: Query = {}) {
        let out = (await all(t.name)).filter((r) => q.deleted || !r.meta.deleted);
        for (const [field, f] of Object.entries(q.where ?? {}))
          out = out.filter((r) => matches(r[field], f));
        if (q.created) out = out.filter((r) => inRange(r.meta.created, q.created!));
        if (q.updated) out = out.filter((r) => inRange(r.meta.updated, q.updated!));
        const by = q.orderBy ?? 'created';
        const key = (r: Stored) =>
          by === 'created' || by === 'updated' ? r.meta[by] : (r[by] as string | number);
        out.sort((a, b) => {
          const [x, y] = [key(a), key(b)];
          return x === y ? a.meta.created.localeCompare(b.meta.created) : x < y ? -1 : 1;
        });
        if (q.order !== 'asc') out.reverse();
        return out.slice(0, q.limit);
      },

      async search(
        types: RecordType[],
        text: string,
        opts: { fields?: string[]; limit?: number } = {},
      ) {
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
        return hit.slice(0, opts.limit);
      },

      async create(t: RecordType, value: Record<string, unknown>) {
        const type = mine(t);
        const { version } = await typeOf(type);
        const { id: asked, ...fields } = value as { id?: string } & Record<string, unknown>;
        const data = shape(type, version, fields);
        const id = asked ?? crypto.randomUUID();
        return serial(`${type}:${id}`, async () => {
          if (await current(type, id)) throw new Error(`${type}: a record ${id} exists`);
          const now = stamp();
          return write(type, undefined, {
            ...data,
            id,
            meta: { type, created: now, updated: now, v: version, rev: 1 },
          } as Stored);
        });
      },

      async update(
        t: RecordType,
        id: string,
        change: (current: Stored) => unknown | Promise<unknown>,
      ) {
        const type = mine(t);
        const { version } = await typeOf(type);
        const target = (await resolve(type, id))?.id ?? id;
        return serial(`${type}:${target}`, async () => {
          const prior = await current(type, target);
          if (!prior || prior.meta.deleted) throw new Error(`${type}: no record ${id}`);
          const next = shape(type, version, await change(prior));
          return write(type, prior, revise(prior, next, { v: version }));
        });
      },

      async delete(t: RecordType, id: string) {
        const type = mine(t);
        await format;
        await serial(`${type}:${id}`, async () => {
          const prior = await current(type, id);
          if (!prior || prior.meta.deleted) return;
          await write(type, prior, revise(prior, fieldsOf(prior), { deleted: stamp() }));
        });
      },

      async restore(t: RecordType, id: string) {
        const type = mine(t);
        await format;
        return serial(`${type}:${id}`, async () => {
          const prior = await current(type, id);
          if (!prior) throw new Error(`${type}: no record ${id}`);
          if (!prior.meta.deleted) return prior;
          const { deleted: _, mergedInto: _m, ...meta } = prior.meta;
          return write(type, prior, {
            ...fieldsOf(prior),
            id,
            meta: { ...meta, updated: stamp(), rev: prior.meta.rev + 1 },
          } as Stored);
        });
      },

      async merge(t: RecordType, keepId: string, mergeId: string) {
        const type = mine(t);
        const { version } = await typeOf(type);
        const [keep, merge] = await Promise.all([get(t, keepId), get(t, mergeId)]);
        if (!(keep && merge)) throw new Error(`${type}: both records must exist to merge`);
        if (keep.id === merge.id) throw new Error(`${type}: a record can't be merged into itself`);
        await serial(`${type}:${merge.id}`, async () => {
          const prior = (await current(type, merge.id))!;
          await write(
            type,
            prior,
            revise(prior, fieldsOf(prior), { deleted: stamp(), mergedInto: keep.id }),
          );
        });
        return serial(`${type}:${keep.id}`, async () => {
          const prior = (await current(type, keep.id))!;
          const fields = shape(type, version, { ...fieldsOf(merge), ...fieldsOf(prior) });
          return write(type, prior, revise(prior, fields));
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

      revert,
    };
    return impl as unknown as RecordsV1;
  };

  /** Drops every type the caller registered, and their records. */
  const forget = async (caller: string) => {
    // biome-ignore lint/performance/noAwaitInLoops: a sweep, once
    for (const prefix of ['t:', 'r:', 'h:'])
      for (const [key] of await storage.list(`${prefix}${caller}/`)) await storage.delete(key);
  };

  return { make, forget };
}

// Collections over storage's own database (store.ts: IndexedDB in the browser). Keys:
//   r:<collection>:<id>          a record as it is now, a tombstone included
//   h:<collection>:<id>:<rev>    each earlier revision of it
// Queries read a collection and filter in memory: plenty for one person's data. Changes to one record
// run one after another (this page is the only tab with Vaulter), so an update always starts from the
// last.

import type { Collection, Filter, Query, Rec } from './api.ts';
import type { Store } from './store.ts';

type Stored = Rec<Record<string, unknown>>;

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

export function collections(storage: Store) {
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

  return <T>(name: string): Collection<T> => {
    const all = async () =>
      (await storage.list<Stored>(`r:${name}:`)).map(([, r]) => r).filter((r) => !r.meta.deleted);
    const current = (id: string) => storage.get<Stored>(`r:${name}:${id}`);
    /** Writes the next revision, keeping the one it replaces. */
    const write = async (prior: Stored | undefined, next: Stored) => {
      if (prior)
        await storage.set(
          `h:${name}:${prior.id}:${String(prior.meta.rev).padStart(9, '0')}`,
          prior,
        );
      await storage.set(`r:${name}:${next.id}`, next);
      return next;
    };
    const revise = (prior: Stored, fields: object, meta: Partial<Stored['meta']> = {}): Stored => ({
      ...fieldsOf(fields as Stored),
      id: prior.id,
      meta: { ...prior.meta, updated: stamp(), rev: prior.meta.rev + 1, ...meta },
    });

    const collection = {
      name,
      async get(id: string) {
        const rec = await current(id);
        return rec?.meta.deleted ? undefined : rec;
      },
      async query(q: Query<Record<string, unknown>> = {}) {
        let out = await all();
        for (const [field, f] of Object.entries(q.where ?? {}))
          if (f !== undefined) out = out.filter((r) => matches(r[field], f));
        out.sort(ordered(q.orderBy ?? 'created', q.order === 'asc' ? 1 : -1));
        return out.slice(0, q.limit);
      },
      async search(text: string, opts: { fields?: string[] } = {}) {
        const want = words(text);
        const hit = (await all()).filter((r) => {
          const values = opts.fields ? opts.fields.map((f) => r[f]) : Object.values(fieldsOf(r));
          const hay = words(
            values
              .flatMap((v) => (Array.isArray(v) ? v : [v]))
              .filter((v) => typeof v === 'string')
              .join(' '),
          ).join(' ');
          return want.every((w) => hay.includes(w));
        });
        return hit.sort((a, b) => b.meta.created.localeCompare(a.meta.created));
      },
      async create(value: Record<string, unknown>) {
        const { id: asked, ...fields } = value as { id?: string } & Record<string, unknown>;
        const id = asked ?? crypto.randomUUID();
        return await serial(`${name}:${id}`, async () => {
          if (await current(id)) throw new Error(`${name}: a record ${id} exists`);
          const now = stamp();
          return write(undefined, {
            ...fields,
            id,
            meta: { collection: name, created: now, updated: now, rev: 1 },
          });
        });
      },
      async update(id: string, change: (current: Stored) => object | Promise<object>) {
        return await serial(`${name}:${id}`, async () => {
          const prior = await current(id);
          if (!prior || prior.meta.deleted) throw new Error(`${name}: no record ${id}`);
          return write(prior, revise(prior, await change(prior)));
        });
      },
      async delete(id: string) {
        await serial(`${name}:${id}`, async () => {
          const prior = await current(id);
          if (!prior || prior.meta.deleted) return;
          await write(prior, revise(prior, fieldsOf(prior), { deleted: stamp() }));
        });
      },
    };
    return collection as unknown as Collection<T>;
  };
}

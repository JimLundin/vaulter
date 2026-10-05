// Collections in storage's database. Keys:
//   r:<collection>:<id>          a record as it is now, tombstones included
//   h:<collection>:<id>:<rev>    each earlier revision of it
// A query reads its whole collection and filters in memory, which is plenty
// for one person's data.

import { omit } from '#kernel';
import type { Collection, Filter, Query, Rec } from './api.ts';
import type { Store } from './store.ts';

type Stored = Rec<Record<string, unknown>>;
type Fields = Record<string, unknown>;

function words(text: string) {
  return text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function matches(value: unknown, filter: Filter) {
  if (filter === null || typeof filter !== 'object') {
    return value === filter;
  }
  if (value === undefined || value === null) {
    return false;
  }
  const atLeast =
    filter.gte == null || (value as never) >= (filter.gte as never);
  const below = filter.lt == null || (value as never) < (filter.lt as never);
  return atLeast && below;
}

function fieldsOf(record: Stored): Fields {
  return omit(record, 'id', 'meta');
}

/** Compares records by `field` (or when they were created or updated), in
 * `direction`. Ties go by when created, and records without the field come
 * last either way. */
function byField(field: string, direction: 1 | -1) {
  function sortValue(record: Stored) {
    if (field === 'created' || field === 'updated') {
      return record.meta[field];
    }
    return record[field] as string | number | undefined;
  }
  return (a: Stored, b: Stored) => {
    const [x, y] = [sortValue(a), sortValue(b)];
    if (x === y) {
      return direction * a.meta.created.localeCompare(b.meta.created);
    }
    if (x === undefined) {
      return 1;
    }
    if (y === undefined) {
      return -1;
    }
    return direction * (x < y ? -1 : 1);
  };
}

/** The words of a record's text: of `fields`, or of every field. */
function textOf(record: Stored, fields?: string[]) {
  const values = fields
    ? fields.map((field) => record[field])
    : Object.values(fieldsOf(record));
  const strings = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === 'string');
  return words(strings.join(' ')).join(' ');
}

/** Times that only go forward, so "latest first" holds even for two
 * changes in one millisecond. */
function clock() {
  let last = 0;
  return () => {
    last = Math.max(Date.now(), last + 1);
    return new Date(last).toISOString();
  };
}

/** Runs changes to one key one after another: each waits for the one
 * before, so an update always starts from the last. */
function inTurn() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, change: () => Promise<T>): Promise<T> => {
    const next = (tails.get(key) ?? Promise.resolve()).then(change, change);
    tails.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  };
}

/** Collections kept in `store`. */
export function collections(store: Store) {
  const now = clock();
  const serial = inTurn();

  return function collection<T>(name: string): Collection<T> {
    const recordKey = (id: string) => `r:${name}:${id}`;
    const historyKey = (record: Stored) =>
      `h:${name}:${record.id}:${String(record.meta.rev).padStart(9, '0')}`;

    async function live() {
      const entries = await store.list<Stored>(`r:${name}:`);
      return entries
        .map(([, record]) => record)
        .filter((record) => !record.meta.deleted);
    }

    function current(id: string) {
      return store.get<Stored>(recordKey(id));
    }

    /** Writes the next revision, keeping the one it replaces. */
    async function write(prior: Stored | undefined, next: Stored) {
      if (prior) {
        await store.set(historyKey(prior), prior);
      }
      await store.set(recordKey(next.id), next);
      return next;
    }

    function revise(
      prior: Stored,
      fields: Fields,
      meta: Partial<Stored['meta']> = {},
    ): Stored {
      return {
        ...omit(fields, 'id', 'meta'),
        id: prior.id,
        meta: {
          ...prior.meta,
          updated: now(),
          rev: prior.meta.rev + 1,
          ...meta,
        },
      };
    }

    async function get(id: string) {
      const record = await current(id);
      return record?.meta.deleted ? undefined : record;
    }

    async function query(q: Query<Fields> = {}) {
      let found = await live();
      for (const [field, filter] of Object.entries(q.where ?? {})) {
        if (filter !== undefined) {
          found = found.filter((record) => matches(record[field], filter));
        }
      }
      found.sort(byField(q.orderBy ?? 'created', q.order === 'asc' ? 1 : -1));
      return found.slice(0, q.limit);
    }

    async function search(text: string, opts: { fields?: string[] } = {}) {
      const wanted = words(text);
      const found = (await live()).filter((record) => {
        const haystack = textOf(record, opts.fields);
        return wanted.every((word) => haystack.includes(word));
      });
      return found.sort((a, b) => b.meta.created.localeCompare(a.meta.created));
    }

    async function create(value: Fields & { id?: string }) {
      const id = value.id ?? crypto.randomUUID();
      return await serial(`${name}:${id}`, async () => {
        if (await current(id)) {
          throw new Error(`${name}: a record ${id} exists`);
        }
        const at = now();
        return write(undefined, {
          ...omit(value, 'id'),
          id,
          meta: { collection: name, created: at, updated: at, rev: 1 },
        });
      });
    }

    async function update(
      id: string,
      change: (record: Stored) => Fields | Promise<Fields>,
    ) {
      return await serial(`${name}:${id}`, async () => {
        const prior = await current(id);
        if (!prior || prior.meta.deleted) {
          throw new Error(`${name}: no record ${id}`);
        }
        return write(prior, revise(prior, await change(prior)));
      });
    }

    async function remove(id: string) {
      await serial(`${name}:${id}`, async () => {
        const prior = await current(id);
        if (!prior || prior.meta.deleted) {
          return;
        }
        await write(prior, revise(prior, fieldsOf(prior), { deleted: now() }));
      });
    }

    const methods = {
      name,
      get,
      query,
      search,
      create,
      update,
      delete: remove,
    };
    return methods as unknown as Collection<T>;
  };
}

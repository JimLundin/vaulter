// Collections in storage's database. Keys:
//   r:<collection>:<id>          a record as it is now, tombstones included
//   h:<collection>:<id>:<rev>    each earlier revision of it
// A query reads its whole collection and filters in memory, which is plenty
// for one person's data.

import { omit } from '#kernel';
import type { Filter, Meta, Query, Rec, Sortable } from './api.ts';
import type { Store } from './store.ts';

/** The words of `text`, in lower case, for search. */
export function words(text: string) {
    return text
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
}

function valueAt(record: object, field: string): unknown {
    return Object.entries(record).find(([key]) => key === field)?.[1];
}

function sortable(value: unknown) {
    return typeof value === 'string' || typeof value === 'number'
        ? value
        : undefined;
}

function compare(x: Sortable, y: Sortable) {
    if (typeof x === 'number' && typeof y === 'number') {
        return x - y;
    }
    const [a, b] = [String(x), String(y)];
    if (a === b) {
        return 0;
    }
    return a < b ? -1 : 1;
}

function matches(value: unknown, filter: Filter) {
    if (filter === null || typeof filter !== 'object') {
        return value === filter;
    }
    const at = sortable(value);
    if (at === undefined) {
        return false;
    }
    const atLeast = filter.gte === undefined || compare(at, filter.gte) >= 0;
    const below = filter.lt === undefined || compare(at, filter.lt) < 0;
    return atLeast && below;
}

/** Compares records by `field` (or when they were created or updated), in
 * `direction`. Ties go by when created, and records without the field come
 * last either way. */
function byField(field: string, direction: 1 | -1) {
    function sortValue(record: Rec<object>) {
        if (field === 'created' || field === 'updated') {
            return record.meta[field];
        }
        return sortable(valueAt(record, field));
    }
    return (a: Rec<object>, b: Rec<object>) => {
        const [x, y] = [sortValue(a), sortValue(b)];
        if (x === y) {
            return direction * compare(a.meta.created, b.meta.created);
        }
        if (x === undefined) {
            return 1;
        }
        if (y === undefined) {
            return -1;
        }
        return direction * compare(x, y);
    };
}

/** The words of a record's text: of `fields`, or of every field. */
function textOf(record: Rec<object>, fields?: string[]) {
    const values = fields
        ? fields.map((field) => valueAt(record, field))
        : Object.values(omit(record, 'id', 'meta'));
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

    /** The collection `name`, by convention `<extension>/<what>`, of
     * records holding `T`. */
    return function collection<T extends object>(name: string) {
        function recordKey(id: string) {
            return `r:${name}:${id}`;
        }

        function historyKey(record: Rec<T>) {
            const revision = String(record.meta.rev).padStart(9, '0');
            return `h:${name}:${record.id}:${revision}`;
        }

        async function live() {
            const entries = await store.list<Rec<T>>(`r:${name}:`);
            return entries
                .map(([, record]) => record)
                .filter((record) => !record.meta.deleted);
        }

        function current(id: string) {
            return store.get<Rec<T>>(recordKey(id));
        }

        /** Writes the next revision, keeping the one it replaces. */
        async function write(prior: Rec<T> | undefined, next: Rec<T>) {
            if (prior) {
                await store.set(historyKey(prior), prior);
            }
            await store.set(recordKey(next.id), next);
            return next;
        }

        /** `fields` as the revision after `prior`. Whatever id and meta
         * `fields` has are storage's, not its own. */
        function revise(prior: Rec<T>, fields: T, meta: Partial<Meta> = {}) {
            return {
                ...fields,
                id: prior.id,
                meta: {
                    ...prior.meta,
                    updated: now(),
                    rev: prior.meta.rev + 1,
                    ...meta,
                },
            };
        }

        return {
            name,

            async get(id: string) {
                const record = await current(id);
                return record?.meta.deleted ? undefined : record;
            },

            async query(query: Query<T> = {}) {
                let found = await live();
                for (const [field, filter] of Object.entries(
                    query.where ?? {},
                )) {
                    if (filter !== undefined) {
                        found = found.filter((record) =>
                            matches(valueAt(record, field), filter),
                        );
                    }
                }
                const direction = query.order === 'asc' ? 1 : -1;
                found.sort(byField(query.orderBy ?? 'created', direction));
                return found.slice(0, query.limit);
            },

            /** Records whose text contains every word of `text`, latest
             * created first. The text is every string field, or only
             * `fields`. */
            async search(
                text: string,
                options: { fields?: (keyof T & string)[] } = {},
            ) {
                const wanted = words(text);
                const found = (await live()).filter((record) => {
                    const haystack = textOf(record, options.fields);
                    return wanted.every((word) => haystack.includes(word));
                });
                return found.sort(byField('created', -1));
            },

            /** A new record. With an `id`, refused if that id is taken. */
            create(value: T & { id?: string }) {
                const id = value.id ?? crypto.randomUUID();
                return serial(`${name}:${id}`, async () => {
                    if (await current(id)) {
                        throw new Error(`${name}: a record ${id} exists`);
                    }
                    const at = now();
                    return write(undefined, {
                        ...value,
                        id,
                        meta: {
                            collection: name,
                            created: at,
                            updated: at,
                            rev: 1,
                        },
                    });
                });
            },

            /** A new revision, from `change`, which gets the record as it
             * is now. No other change to it runs until this one is done. */
            update(id: string, change: (current: Rec<T>) => T | Promise<T>) {
                return serial(`${name}:${id}`, async () => {
                    const prior = await current(id);
                    if (!prior || prior.meta.deleted) {
                        throw new Error(`${name}: no record ${id}`);
                    }
                    return write(prior, revise(prior, await change(prior)));
                });
            },

            /** Leaves a tombstone. */
            delete(id: string) {
                return serial(`${name}:${id}`, async () => {
                    const prior = await current(id);
                    if (prior && !prior.meta.deleted) {
                        await write(
                            prior,
                            revise(prior, prior, { deleted: now() }),
                        );
                    }
                });
            },
        };
    };
}

// Storage: records in this browser, in typed collections, for every
// extension that keeps data. It wraps Dexie (IndexedDB): nothing else uses
// Dexie, and nothing of Dexie's shows in what it offers, so it can move onto
// something else without its users changing. Each collection is a database
// of its own, and a change to a record runs in one transaction, so two at
// once can't lose either, even from two tabs.

import { Dexie } from 'dexie';
import { z } from 'zod';
import { type Extension, type Operation, operation } from '#core';

/** A record: what it holds, and its id. */
export type Rec<T> = T & { id: string };

type Sortable = string | number;

/** A top-level field equal to a value, or from `gte` (included) to `lt`
 * (not included). */
export type Filter =
    | Sortable
    | boolean
    | null
    | { gte?: Sortable; lt?: Sortable };

type Where<T> = { [K in keyof T]?: Filter };

const Sortable = z.union([z.string(), z.number()]);
const Filter = z.union([
    Sortable,
    z.boolean(),
    z.null(),
    z.object({ gte: Sortable.optional(), lt: Sortable.optional() }),
]);
/** A field's filter left out, as `{ at: { gte: since } }` leaves out `lt`. */
const Unset = z.undefined();

function valueAt(record: object, field: string): unknown {
    return Object.entries(record).find(([key]) => key === field)?.[1];
}

function matches(value: unknown, filter: Filter) {
    if (filter === null || typeof filter !== 'object') {
        return value === filter;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
        return false;
    }
    const atLeast = filter.gte === undefined || value >= filter.gte;
    const below = filter.lt === undefined || value < filter.lt;
    return atLeast && below;
}

/** Whether `value` is a where: an object of a filter, or none, by field. */
function isWhere(value: unknown) {
    return z.record(z.string(), z.union([Filter, Unset])).safeParse(value)
        .success;
}

function isFunction(value: unknown) {
    return typeof value === 'function';
}

/** The collection `name`, by convention `<extension>/<what>`, of records
 * that `schema` checks as they are written. `indexes` are the fields it can
 * be ordered by. Its operations are its owner's, which offers them, or
 * not, as its own. */
export function collection<Schema extends z.ZodObject>(
    name: string,
    schema: Schema,
    indexes: (keyof z.output<Schema> & string)[] = [],
) {
    type T = z.output<Schema>;
    const Kept = z.intersection(schema, z.object({ id: z.string() }));
    const New = z.intersection(schema, z.object({ id: z.string().optional() }));
    const db = new Dexie(`vaulter/${name}`);
    db.version(1).stores({ records: ['id', ...indexes].join(', ') });
    const records = db.table<Rec<T>, string>('records');

    return {
        get: operation({
            description: 'A record by its id.',
            input: z.object({ id: z.string() }),
            run: ({ id }) => records.get(id),
        }),

        query: operation({
            description:
                'Records whose fields fit `where`, ordered by one of the ' +
                "collection's indexes (leaving out records without it), " +
                'up to `limit`.',
            input: z.object({
                where: z.custom<Where<T>>(isWhere).optional(),
                orderBy: z
                    .custom<keyof T & string>((field) =>
                        indexes.some((index) => index === field),
                    )
                    .optional(),
                order: z.enum(['asc', 'desc']).optional(),
                limit: z.number().int().positive().optional(),
            }),
            run: ({ where = {}, orderBy, order, limit }) => {
                const ordered = orderBy
                    ? records.orderBy(orderBy)
                    : records.toCollection();
                const directed = order === 'desc' ? ordered.reverse() : ordered;
                const filters = Object.entries<Filter | undefined>(where);
                const found = directed.filter((record) =>
                    filters.every(
                        ([field, filter]) =>
                            filter === undefined ||
                            matches(valueAt(record, field), filter),
                    ),
                );
                return (limit ? found.limit(limit) : found).toArray();
            },
        }),

        create: operation({
            description:
                'A new record. With an `id`, refused if that id is taken.',
            input: New,
            run: async (value) => {
                const record = Kept.parse({
                    ...value,
                    id: value.id ?? crypto.randomUUID(),
                });
                await records.add(record);
                return record;
            },
        }),

        update: operation({
            description:
                'The record `id` changed by `change`, which gets it as it ' +
                'is now. No other change to it runs until this one is done.',
            input: z.object({
                id: z.string(),
                change: z.custom<(current: Rec<T>) => T>(isFunction),
            }),
            run: ({ id, change }) =>
                db.transaction('rw', records, async () => {
                    const current = await records.get(id);
                    if (!current) {
                        throw new Error(`${name}: no record ${id}`);
                    }
                    const changed = Kept.parse({ ...change(current), id });
                    await records.put(changed);
                    return changed;
                }),
        }),

        put: operation({
            description: 'Writes a record, whether or not it exists.',
            input: Kept,
            run: async (record) => {
                await records.put(record);
                return record;
            },
        }),

        delete: operation({
            description: 'Deletes a record, if there is one.',
            input: z.object({ id: z.string() }),
            run: ({ id }) => records.delete(id),
        }),
    } satisfies Record<string, Operation>;
}

/** Storage offers nothing of its own: each collection's operations are its
 * owner's. */
export const extension = {} satisfies Extension;

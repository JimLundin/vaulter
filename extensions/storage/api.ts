// What storage keeps: records in collections, each named by its owner
// (`wiki/page`) and typed by what it holds.
//
// Storage checks nothing it is given. Data from outside typed code is
// checked where it comes in. Nothing is overwritten or removed for good:
// every change is a new revision, the one before is kept, and deleting
// leaves a hidden tombstone.

/** What storage keeps about a record, beside what it holds. */
export interface Meta {
    collection: string;
    created: string;
    updated: string;
    /** 1 when created, one more with every change. */
    rev: number;
    /** When it was deleted, for a tombstone. */
    deleted?: string;
}

/** A record: what it holds, its id, and what storage keeps about it. */
export type Rec<T> = T & { id: string; meta: Meta };

/** What a field can be ordered and ranged by. */
export type Sortable = string | number;

/** A top-level field equal to a value, or from `gte` (included) to `lt`
 * (not included). */
export type Filter =
    | Sortable
    | boolean
    | null
    | { gte?: Sortable; lt?: Sortable };

export interface Query<T> {
    where?: { [K in keyof T]?: Filter };
    /** A top-level field, or `created` or `updated` (the default). Records
     * without the field come last. */
    orderBy?: (keyof T & string) | 'created' | 'updated';
    /** `desc` (the default) puts the latest first. */
    order?: 'asc' | 'desc';
    limit?: number;
}

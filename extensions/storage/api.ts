// What storage keeps: records in collections, each named by its owner
// (`wiki/person`) and typed by what it holds.
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

export type Rec<T> = T & { id: string; meta: Meta };

type Scalar = string | number | boolean | null;

/** A top-level field equal to a value, or from `gte` (included) to `lt`
 * (not included). */
export type Filter = Scalar | { gte?: Scalar; lt?: Scalar };

export interface Query<T> {
  where?: { [K in keyof T]?: Filter };
  /** A top-level field, or `created` or `updated` (the default). Records
   * without the field come last. */
  orderBy?: (keyof T & string) | 'created' | 'updated';
  /** `desc` (the default) puts the latest first. */
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface Collection<T> {
  readonly name: string;
  get: (id: string) => Promise<Rec<T> | undefined>;
  query: (q?: Query<T>) => Promise<Rec<T>[]>;
  /** Records whose text contains every word of `text`, latest created
   * first. The text is every string field, or only `fields`. */
  search: (
    text: string,
    opts?: { fields?: (keyof T & string)[] },
  ) => Promise<Rec<T>[]>;
  /** A new record. With an `id`, refused if that id is taken. */
  create: (value: T & { id?: string }) => Promise<Rec<T>>;
  /** A new revision, from `change`, which gets the record as it is now. No
   * other change to it runs until this one is done. */
  update: (
    id: string,
    change: (current: Rec<T>) => T | Promise<T>,
  ) => Promise<Rec<T>>;
  /** Leaves a tombstone. */
  delete: (id: string) => Promise<void>;
}

/** How one record points at another: its collection and id. */
export interface RecordRef {
  type: string;
  id: string;
}

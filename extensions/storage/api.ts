// Records: what every extension keeps, in collections. A collection is named by its owner
// (`wiki/person`) and typed by what it holds; storage keeps what it is given, and checks nothing:
// what comes from outside typed code is checked where it comes in.
//
// Nothing is overwritten or removed for good. Every change makes a new revision and storage keeps the
// one before; changes to one record run one after another, each `update` getting the record as the
// last one left it, so two changes at once can't lose either. Deleting leaves a tombstone. Reading
// earlier revisions and tombstones back comes with the screen that needs it.

import { z } from 'zod';

/** What storage keeps about a record, beside what it holds. */
export interface Meta {
  collection: string;
  created: string;
  updated: string;
  /** Its revision: 1 when created, one more with every change. */
  rev: number;
  /** When it was deleted: a tombstone, kept and hidden. */
  deleted?: string;
}

export type Rec<T> = T & { id: string; meta: Meta };

type Scalar = string | number | boolean | null;
/** A top-level field: equal to a value, or from `gte` (included) to `lt` (not). */
export type Filter = Scalar | { gte?: Scalar; lt?: Scalar };

export interface Query<T> {
  where?: { [K in keyof T]?: Filter };
  /** A top-level field, or `created` or `updated` (the default); records without it come last. */
  orderBy?: (keyof T & string) | 'created' | 'updated';
  /** `desc` (the default): the latest first. */
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface Collection<T> {
  readonly name: string;
  get: (id: string) => Promise<Rec<T> | undefined>;
  query: (q?: Query<T>) => Promise<Rec<T>[]>;
  /** Records whose text fields (or `fields`, strings and arrays of them) contain every word of
   * `text`, the latest created first. */
  search: (text: string, opts?: { fields?: (keyof T & string)[] }) => Promise<Rec<T>[]>;
  /** A new record; with an `id`, refused if that id is taken. */
  create: (value: T & { id?: string }) => Promise<Rec<T>>;
  /** A new revision of the record, from `change`, which gets it as it is now: no other change to it
   * runs until this one is done. */
  update: (id: string, change: (current: Rec<T>) => T | Promise<T>) => Promise<Rec<T>>;
  /** Leaves a tombstone. */
  delete: (id: string) => Promise<void>;
}

/** A record, by its collection and id: how one record points at another. */
export const RecordRef = z.object({ type: z.string(), id: z.string() });
export type RecordRef = z.infer<typeof RecordRef>;

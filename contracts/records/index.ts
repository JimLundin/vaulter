// Records: typed data every extension keeps through one storage provider, each in its own namespace
// (ARCHITECTURE.md, "A contract: records"). A type is registered by name once and then passed around
// as a handle, so another extension refers to it by the handle a contract gives it, never by a string.
//
// Handles are plain data: the name. The provider names a type in its caller's
// namespace and checks and shapes every value with the type's own Zod (defaults and trims included).
// An extension may read any type it has a handle for, and write only its own.
//
// Nothing is overwritten or removed for good. Every change makes a new revision and keeps the one
// before (`history`); changes to one record run one after another, each `update` getting the record as
// the last one left it, so two changes at once can't lose either. Deleting or merging leaves a
// tombstone that can be restored. A type's fields may grow with optional fields and defaults; a change
// that breaks stored records will bring versions and migrations with it, when there is one. Only
// removing the
// extension drops its records.
import { defineContract } from '#kernel';
import { z } from 'zod';

export type Unsubscribe = () => void;

export interface RecordType<S extends z.ZodRawShape = z.ZodRawShape> {
  readonly kind: 'record-type';
  /** `extension/name`: the namespace is the registering extension's id. */
  readonly name: string;
  /** Only for the types. */
  readonly _shape?: S;
}

/** What the provider keeps about a record, beside its fields. */
export interface Meta {
  type: string;
  created: string;
  updated: string;
  /** Its revision: 1 when created, one more with every change. */
  rev: number;
  /** When it was deleted or merged away: a tombstone, hidden unless asked for. */
  deleted?: string;
  /** The id of the record it was merged into. */
  mergedInto?: string;
}

export type Rec<S extends z.ZodRawShape> = { id: string } & z.output<z.ZodObject<S>> & {
    meta: Meta;
  };
export type Input<S extends z.ZodRawShape> = z.input<z.ZodObject<S>>;
export type Stored = { id: string; meta: Meta } & Record<string, unknown>;

type Scalar = string | number | boolean | null;
/** A top-level field: equal to a value, or from `gte` (included) to `lt` (not). */
export type Filter = Scalar | { gte?: Scalar; lt?: Scalar };

export interface Query {
  where?: Record<string, Filter>;
  /** A top-level field, or `created` or `updated` (the default); records without it come last. */
  orderBy?: string;
  /** `desc` (the default): the latest first. */
  order?: 'asc' | 'desc';
  limit?: number;
  /** Tombstones too. */
  deleted?: boolean;
}

/** Provided per calling extension (`perCaller`), which is how a type gets its caller's namespace. */
export interface RecordsV1 {
  registerType: <S extends z.ZodRawShape>(name: string, fields: S) => Promise<RecordType<S>>;
  /** A merged record's id reads as the one it was merged into; with `deleted`, the record itself,
   * a tombstone included. */
  get: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    id: string,
    opts?: { deleted?: boolean },
  ) => Promise<Rec<S> | undefined>;
  query: <S extends z.ZodRawShape>(type: RecordType<S>, q?: Query) => Promise<Rec<S>[]>;
  /** Records of `types` whose text fields (or `fields`, strings and arrays of them) contain every
   * word of `text`, the latest created first. */
  search: <S extends z.ZodRawShape>(
    types: RecordType<S>[],
    text: string,
    opts?: { fields?: (keyof S & string)[] },
  ) => Promise<Rec<S>[]>;
  /** A new record; with an `id`, refused if that id is taken. */
  create: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    value: Input<S> & { id?: string },
  ) => Promise<Rec<S>>;
  /** A new revision of the record, from `change`, which gets it as it is now: no other change to it
   * runs until this one is done. */
  update: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    id: string,
    change: (current: Rec<S>) => Input<S> | Promise<Input<S>>,
  ) => Promise<Rec<S>>;
  /** Leaves a tombstone. */
  delete: (type: RecordType, id: string) => Promise<void>;
  restore: <S extends z.ZodRawShape>(type: RecordType<S>, id: string) => Promise<Rec<S>>;
  /** Folds `merge` into `keep` (keep's fields win); `merge` becomes a tombstone that reads as `keep`. */
  merge: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    keep: string,
    merge: string,
  ) => Promise<Rec<S>>;
  /** The record's earlier revisions, the latest first. */
  history: <S extends z.ZodRawShape>(type: RecordType<S>, id: string) => Promise<Rec<S>[]>;
  onChanged: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    handler: (change: Rec<S>) => void,
  ) => Promise<Unsubscribe>;
}

export const RecordRef = z.object({ type: z.string(), id: z.string() });
export type RecordRef = z.infer<typeof RecordRef>;

export const records = defineContract<RecordsV1>({ name: 'records', version: 1 });

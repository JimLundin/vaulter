import type { AnyField, EntityDefinition, Field, Registry, Entity, Schema } from './schema.ts';
import type { EntityRef, entityIdentity } from './identity.ts';
import type { MemoryStorage } from './memory.ts';

export const clear: unique symbol = Symbol('Clear optional attribute');
export type Clear = typeof clear;

export type InputValue<F extends AnyField> =
  F extends Field<'ref', infer E extends EntityDefinition, boolean>
    ? EntityRef<E>
    : F extends Field<'set', infer Item extends AnyField, boolean>
      ? readonly InputValue<Item>[]
      : F extends Field<'scalar' | 'json' | 'historical', infer V, boolean>
        ? V
        : never;
type StoredValue<F extends AnyField> =
  F extends Field<'inverse', infer E extends EntityDefinition, boolean>
    ? readonly EntityRef<E>[]
    : InputValue<F>;
type OptionalKeys<E extends EntityDefinition> = {
  [K in keyof E['fields']]: E['fields'][K]['isOptional'] extends true ? K : never;
}[keyof E['fields']];
type WritableKeys<E extends EntityDefinition> = {
  [K in keyof E['fields']]: E['fields'][K]['kind'] extends 'inverse' ? never : K;
}[keyof E['fields']];
type InputFields<E extends EntityDefinition> = {
  [K in Exclude<WritableKeys<E>, OptionalKeys<E>>]: InputValue<E['fields'][K]>;
} & {
  [K in OptionalKeys<E>]?: InputValue<E['fields'][K]>;
};
type Insert<E extends EntityDefinition> = InputFields<E> & { readonly [entityIdentity]?: never };
type Update<E extends EntityDefinition> = EntityRef<E> & {
  readonly [K in WritableKeys<E>]?:
    | InputValue<E['fields'][K]>
    | (K extends OptionalKeys<E> ? Clear : never);
};
type Stored<E extends EntityDefinition> = EntityRef<E> & {
  readonly [K in Exclude<WritableKeys<E>, OptionalKeys<E>>]: StoredValue<E['fields'][K]>;
} & {
  readonly [K in OptionalKeys<E>]?: StoredValue<E['fields'][K]>;
};
type KnownKeys<T, Allowed> = Record<Exclude<keyof T, keyof Allowed>, never>;

type FieldSelection<F extends AnyField> =
  | true
  | (F extends Field<'ref' | 'inverse', infer E extends EntityDefinition, boolean>
      ? string extends E['name']
        ? never
        : Selection<E>
      : F extends Field<'set', infer Item extends AnyField, boolean>
        ? FieldSelection<Item>
        : never);
export type Selection<E extends EntityDefinition> = {
  readonly [K in keyof E['fields']]?: FieldSelection<E['fields'][K]>;
};
type SelectedValue<F extends AnyField, S> = S extends true
  ? StoredValue<F>
  : F extends Field<'inverse', infer E extends EntityDefinition, boolean>
    ? readonly Selected<E, S>[]
    : F extends Field<'ref', infer E extends EntityDefinition, boolean>
      ? Selected<E, S>
      : F extends Field<'set', infer Item extends AnyField, boolean>
        ? readonly SelectedValue<Item, S>[]
        : never;
export type Selected<E extends EntityDefinition, S> = EntityRef<E> & {
  readonly [K in Exclude<keyof S, OptionalKeys<E>>]: K extends keyof E['fields']
    ? SelectedValue<E['fields'][K], S[K]>
    : never;
} & {
  readonly [K in Extract<keyof S, OptionalKeys<E>>]?: K extends keyof E['fields']
    ? SelectedValue<E['fields'][K], S[K]>
    : never;
};
type ExactSelection<E extends EntityDefinition, S> = KnownKeys<S, Selection<E>> & {
  [K in keyof S]: K extends keyof E['fields'] ? ExactFieldSelection<E['fields'][K], S[K]> : unknown;
};
type ExactFieldSelection<F extends AnyField, S> = S extends true
  ? unknown
  : F extends Field<'ref' | 'inverse', infer E extends EntityDefinition, boolean>
    ? ExactSelection<E, S>
    : F extends Field<'set', infer Item extends AnyField, boolean>
      ? ExactFieldSelection<Item, S>
      : unknown;

type ScalarPredicate<V> = { readonly eq?: V; readonly in?: readonly V[] } & (V extends Date | number
  ? { readonly gte?: V; readonly lt?: V }
  : V extends string
    ? { readonly contains?: string }
    : unknown);
type FieldPredicate<F extends AnyField> =
  F extends Field<'inverse', infer E extends EntityDefinition, boolean>
    ? { readonly some?: Where<E> }
    : F extends Field<'ref', infer E extends EntityDefinition, boolean>
      ? { readonly eq?: EntityRef<E>; readonly matches?: Where<E> }
      : F extends Field<'set', infer Item extends AnyField, boolean>
        ? { readonly some?: FieldPredicate<Item> }
        : F extends Field<'json' | 'historical', infer V, boolean>
          ? { readonly eq?: V; readonly in?: readonly V[] }
          : F extends Field<'scalar', infer V, boolean>
            ? ScalarPredicate<V>
            : never;
export type Where<E extends EntityDefinition> = {
  readonly and?: readonly Where<E>[];
  readonly or?: readonly Where<E>[];
  readonly not?: Where<E>;
} & { readonly [K in keyof E['fields']]?: FieldPredicate<E['fields'][K]> };

export interface QueryOptions<E extends EntityDefinition, S extends Selection<E>> {
  readonly select: S & ExactSelection<E, S>;
  readonly where?: Where<E>;
  readonly orderBy?: readonly {
    readonly [K in keyof E['fields']]?: E['fields'][K]['kind'] extends 'scalar'
      ? 'asc' | 'desc'
      : never;
  }[];
  readonly after?: EntityRef<E>;
}
export interface Reader<E extends EntityDefinition> {
  get: <const S extends Selection<E>>(
    entity: EntityRef<E>,
    options: { readonly select: S & ExactSelection<E, S> },
  ) => Promise<Selected<E, S> | undefined>;
  /** Defaults to 100 top-level rows; null explicitly requests every match. */
  query: <const S extends Selection<E>>(
    options: QueryOptions<E, S> & { readonly limit?: number | null },
  ) => Promise<Selected<E, S>[]>;
  first: <const S extends Selection<E>>(
    options: QueryOptions<E, S> & { readonly limit?: never },
  ) => Promise<Selected<E, S> | undefined>;
}
export interface Writer<E extends EntityDefinition> extends Reader<E> {
  insert: <const T extends Insert<E>>(data: T & KnownKeys<T, Insert<E>>) => Promise<Stored<E>>;
  update: <const T extends Update<E>>(data: T & KnownKeys<T, Update<E>>) => Promise<void>;
  delete: <const T extends EntityRef<E>>(entity: T) => Promise<void>;
}

export type TransactionEntity = Entity<
  '@transaction',
  {
    readonly sequence: Field<'scalar', number>;
    readonly committedAt: Field<'scalar', Date>;
    readonly schemaRevision: Field<'scalar', number>;
    readonly author: Field<'ref', EntityDefinition, true>;
    readonly origin: Field<'ref', EntityDefinition, true>;
  }
>;
export type TransactionRef = EntityRef<TransactionEntity>;
/** Serializable evidence address. It selects an entity in an accepted snapshot, not live state. */
export interface HistoricalReference {
  readonly format: 'vaulter-eav-snapshot-v1';
  readonly scope: string;
  readonly journal: string;
  readonly transaction: string;
  readonly entity: string;
  readonly type: string;
}
export interface TransactionContext {
  readonly author?: EntityRef<EntityDefinition>;
  readonly origin?: EntityRef<EntityDefinition>;
}
export interface Transaction<R extends Registry> {
  readonly entities: { readonly [K in keyof R]: Writer<R[K]> };
}
export interface ReadView<R extends Registry> {
  readonly entities: { readonly [K in keyof R]: Reader<R[K]> };
}

interface ChangeSelection<E extends EntityDefinition> {
  readonly sequence?: true;
  readonly entity?: true;
  readonly transaction?: Selection<TransactionEntity>;
  readonly before?: Selection<E>;
  readonly after?: Selection<E>;
}
type ChangeResult<E extends EntityDefinition, S> = {
  readonly [K in keyof S]: K extends 'sequence'
    ? number
    : K extends 'entity'
      ? EntityRef<E>
      : K extends 'transaction'
        ? Selected<TransactionEntity, S[K]>
        : K extends 'before' | 'after'
          ? Selected<E, S[K]> | null
          : never;
};
type ExactChangeSelection<E extends EntityDefinition, S> = KnownKeys<S, ChangeSelection<E>> & {
  [K in keyof S]: K extends 'before' | 'after'
    ? ExactSelection<E, S[K]>
    : K extends 'transaction'
      ? ExactSelection<TransactionEntity, S[K]>
      : unknown;
};
export interface ChangeOptions<E extends EntityDefinition, S extends ChangeSelection<E>> {
  readonly select: S & ExactChangeSelection<E, S>;
  readonly where?: {
    readonly entity?: { readonly eq: EntityRef<E> };
    readonly transaction?: { readonly eq: TransactionRef };
    readonly sequence?: ScalarPredicate<number>;
  };
  readonly orderBy?: readonly { readonly sequence: 'asc' | 'desc' }[];
}
export interface ChangeReader<E extends EntityDefinition> {
  /** Defaults to 100 top-level rows; null explicitly requests every match. */
  query: <const S extends ChangeSelection<E>>(
    options: ChangeOptions<E, S> & { readonly limit?: number | null },
  ) => Promise<ChangeResult<E, S>[]>;
  first: <const S extends ChangeSelection<E>>(
    options: ChangeOptions<E, S> & { readonly limit?: never },
  ) => Promise<ChangeResult<E, S> | undefined>;
}
export type TransactionChange<R extends Registry> = {
  [K in keyof R]: {
    readonly type: K;
    readonly entity: EntityRef<R[K]>;
    readonly before: Stored<R[K]> | null;
    readonly after: Stored<R[K]> | null;
  };
}[keyof R];
export interface History<R extends Registry> {
  reference: (
    transaction: TransactionRef,
    entity: EntityRef<EntityDefinition>,
  ) => Promise<HistoricalReference>;
  resolve: (reference: unknown) => Promise<{
    readonly transaction: TransactionRef;
    readonly entity: EntityRef<EntityDefinition>;
  }>;
  readonly transactions: Reader<TransactionEntity>;
  readonly entities: { readonly [K in keyof R]: ChangeReader<R[K]> };
  changes: (transaction: TransactionRef) => Promise<readonly TransactionChange<R>[]>;
  /** Generic tooling can resolve attribution without knowing its entity type in advance. */
  inspect: (
    transaction: TransactionRef,
    entity: EntityRef<EntityDefinition>,
  ) => Promise<
    { readonly type: string; readonly values: Readonly<Record<string, unknown>> } | undefined
  >;
}
export interface Database<R extends Registry> extends ReadView<R>, AsyncDisposable {
  readonly history: History<R>;
  readonly refresh: () => Promise<void>;
  readonly schema: {
    revisions: () => Promise<readonly { readonly revision: number; readonly schema: Schema }[]>;
  };
  at: (transaction: TransactionRef) => ReadView<R>;
  transaction<T>(work: (tx: Transaction<R>) => Promise<T>): Promise<T>;
  transaction<T>(context: TransactionContext, work: (tx: Transaction<R>) => Promise<T>): Promise<T>;
  subscribe: (listener: () => void) => () => void;
}
/** A domain can consume its entities in a larger registry without narrowing generic history changes. */
export type DomainDatabase<R extends Registry> = Omit<Database<R>, 'history'> & {
  readonly history: Omit<History<R>, 'changes'>;
};
export interface OpenOptions<R extends Registry> {
  readonly schema: R;
  readonly storage?: MemoryStorage;
}

// Records: typed data every extension keeps through one storage provider, each in its own namespace
// (ARCHITECTURE.md, "A contract: records"). A type is registered by name once and then passed around
// as a handle, so another extension refers to it by the handle a contract gives it, never by a string.
//
// Handles are plain data: the name, the fields as JSON Schema, the version. The client below names a
// type in its caller's namespace, shapes values with the type's own Zod (defaults, trims: code only the
// requirer has), and keeps registerType synchronous; the provider checks every value against the
// type's schema and refuses what doesn't fit. An extension may read any type it has a handle for, and
// write only its own.
//
// Nothing is overwritten or removed for good. Every change makes a new revision and keeps the one
// before (`history`); a change names the revision it was made from, so two changes at once can't lose
// either (`update` retries on a conflict). Deleting or merging leaves a tombstone that can be restored.
// A type's version goes up with a change to its fields, with a migration from each older version,
// which the provider runs once and can revert. Only removing the extension drops its records.
import { defineContract, func } from '@pip/kernel';
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;
export type Unsubscribe = () => void;

export interface RecordType<S extends z.ZodRawShape = z.ZodRawShape> {
  readonly kind: 'record-type';
  /** `extension/name`: the namespace is the registering extension's id. */
  readonly name: string;
  readonly schema: JsonSchema;
  readonly version: number;
  /** Only for the types. */
  readonly _shape?: S;
}

/** What the provider keeps about a record, beside its fields. */
export interface Meta {
  type: string;
  created: string;
  updated: string;
  /** The type's version this record is at. */
  v: number;
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
/** A range, on a field or on when records were created or changed. */
export interface Range {
  gt?: Scalar;
  gte?: Scalar;
  lt?: Scalar;
  lte?: Scalar;
}
/** A top-level field: equal to a value, or matching every operator given (`has`: an array field
 * holding the value). Objects compare by value. */
export type Filter = Scalar | (Range & { eq?: unknown; in?: unknown[]; has?: unknown });

export interface Query {
  where?: Record<string, Filter>;
  created?: Range;
  updated?: Range;
  /** A top-level field, or `created` or `updated` (the default). */
  orderBy?: string;
  /** `desc` (the default): the latest first. */
  order?: 'asc' | 'desc';
  limit?: number;
  /** Tombstones too. */
  deleted?: boolean;
}

/** Changing a record failed because it changed since it was read. */
export class Conflict extends Error {
  override name = 'Conflict';
}
export const isConflict = (e: unknown) => (e as Error | undefined)?.name === 'Conflict';

type Migration = (
  old: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** What a provider implements, per calling extension (`perCaller`). */
export interface RecordsWire {
  /** `type` is `<caller>/<name>`: only the caller's own. */
  register: (
    type: string,
    schema: JsonSchema,
    version: number,
    migrations: Record<string, Migration>,
  ) => Promise<void>;
  /** A merged record's id reads as the one it was merged into; with `deleted`, the record itself,
   * a tombstone included. */
  get: (type: string, id: string, opts?: { deleted?: boolean }) => Promise<Stored | undefined>;
  query: (type: string, q?: Query) => Promise<Stored[]>;
  /** Records of `types` whose text fields (or `fields`, strings and arrays of them) contain every
   * word of `text`. */
  search: (
    types: string[],
    text: string,
    opts?: { fields?: string[]; limit?: number },
  ) => Promise<Stored[]>;
  /** A new record; with an `id`, refused if that id is taken. */
  create: (type: string, value: Record<string, unknown>) => Promise<Stored>;
  /** A new revision of the record, refused with a Conflict unless it is still at `rev`. */
  replace: (
    type: string,
    id: string,
    fields: Record<string, unknown>,
    rev: number,
  ) => Promise<Stored>;
  /** Leaves a tombstone. */
  delete: (type: string, id: string) => Promise<void>;
  restore: (type: string, id: string) => Promise<Stored>;
  /** Folds `merge` into `keep` (keep's fields win); `merge` becomes a tombstone that reads as `keep`. */
  merge: (type: string, keep: string, merge: string) => Promise<Stored>;
  /** The record's earlier revisions, the latest first. */
  history: (type: string, id: string) => Promise<Stored[]>;
  onChanged: (type: string, handler: (change: Stored) => void) => Promise<Unsubscribe>;
  /** Puts every record of the type back as it was at `version`, undoing later migrations. */
  revert: (type: string, version: number) => Promise<void>;
}

/** What a requirer uses. */
export interface RecordsV1 {
  registerType: <S extends z.ZodRawShape>(
    name: string,
    fields: S,
    opts?: { version?: number; migrate?: Record<number, Migration> },
  ) => RecordType<S>;
  get: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    id: string,
    opts?: { deleted?: boolean },
  ) => Promise<Rec<S> | undefined>;
  query: <S extends z.ZodRawShape>(type: RecordType<S>, q?: Query) => Promise<Rec<S>[]>;
  search: <S extends z.ZodRawShape>(
    types: RecordType<S>[],
    text: string,
    opts?: { fields?: (keyof S & string)[]; limit?: number },
  ) => Promise<Rec<S>[]>;
  create: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    value: Input<S> & { id?: string },
  ) => Promise<Rec<S>>;
  /** Changes a record by `change`, which gets it as it is now: run again if it changed meanwhile, a
   * few times, then a Conflict. */
  update: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    id: string,
    change: (current: Rec<S>) => Input<S> | Promise<Input<S>>,
  ) => Promise<Rec<S>>;
  delete: (type: RecordType, id: string) => Promise<void>;
  restore: <S extends z.ZodRawShape>(type: RecordType<S>, id: string) => Promise<Rec<S>>;
  merge: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    keep: string,
    merge: string,
  ) => Promise<Rec<S>>;
  history: <S extends z.ZodRawShape>(type: RecordType<S>, id: string) => Promise<Rec<S>[]>;
  onChanged: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    handler: (change: Rec<S>) => void,
  ) => Promise<Unsubscribe>;
  revert: (type: RecordType, version: number) => Promise<void>;
}

export const RecordRef = z.object({ type: z.string(), id: z.string() });
export type RecordRef = z.infer<typeof RecordRef>;

/** A field holding a reference to a record of `type`: `place: refTo(wiki.place).optional()`. */
export const refTo = (type: RecordType) => RecordRef.extend({ type: z.literal(type.name) });

// The namespace is an extension id, or a scratch instance's (`id~conformance`, made by the kernel).
const TypeName = z.string().regex(/^[a-z][a-z0-9-]*(~[a-z]+)?\/[a-z][a-z0-9-]*$/, {
  message: 'extension/name, in lowercase words joined by dashes',
});
const RangeSchema = z.object({
  gt: z.unknown().optional(),
  gte: z.unknown().optional(),
  lt: z.unknown().optional(),
  lte: z.unknown().optional(),
});
const QuerySchema = z.object({
  where: z
    .record(
      z.string(),
      z.union([
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
        RangeSchema.extend({
          eq: z.unknown().optional(),
          in: z.array(z.unknown()).optional(),
          has: z.unknown().optional(),
        }),
      ]),
    )
    .optional(),
  created: RangeSchema.optional(),
  updated: RangeSchema.optional(),
  orderBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().optional(),
  deleted: z.boolean().optional(),
});
const Fields = z.record(z.string(), z.unknown());

const schemas = new Map<string, z.ZodType>();
/** The Zod schema for a handle's fields, made once per type and version. */
export function schemaOf(type: RecordType): z.ZodType {
  const key = `${type.name}@${type.version}`;
  if (!schemas.has(key)) schemas.set(key, z.fromJSONSchema(type.schema as never));
  return schemas.get(key)!;
}

const TRIES = 4;

export const records = defineContract<RecordsV1, RecordsWire>({
  name: 'records',
  version: '1.0.0',
  inputs: {
    register: z.tuple([
      TypeName,
      Fields,
      z.number().int().positive(),
      z.record(z.string(), func()),
    ]),
    get: z.tuple([TypeName, z.string(), z.object({ deleted: z.boolean().optional() }).optional()]),
    query: z.tuple([TypeName, QuerySchema.optional()]),
    search: z.tuple([
      z.array(TypeName),
      z.string(),
      z
        .object({
          fields: z.array(z.string()).optional(),
          limit: z.number().int().positive().optional(),
        })
        .optional(),
    ]),
    create: z.tuple([TypeName, Fields]),
    replace: z.tuple([TypeName, z.string(), Fields, z.number().int().positive()]),
    delete: z.tuple([TypeName, z.string()]),
    restore: z.tuple([TypeName, z.string()]),
    merge: z.tuple([TypeName, z.string(), z.string()]),
    history: z.tuple([TypeName, z.string()]),
    onChanged: z.tuple([TypeName, func()]),
    revert: z.tuple([TypeName, z.number().int().positive()]),
  },
  client(remote, { caller }) {
    // Registration is sent at once; anything done with the type waits for it (a migration included).
    const ready = new Map<string, Promise<void>>();
    const own = (t: RecordType) => ready.get(t.name) ?? Promise.resolve();
    const shape = (type: RecordType, value: unknown) =>
      schemaOf(type).parse(value) as Record<string, unknown>;
    return {
      registerType(name, fields, opts = {}) {
        const zod = z.object(fields);
        const type: RecordType<typeof fields> = Object.freeze({
          kind: 'record-type',
          name: `${caller}/${name}`,
          schema: {
            ...(z.toJSONSchema(zod, { io: 'input', unrepresentable: 'any' }) as JsonSchema),
            additionalProperties: false,
          },
          version: opts.version ?? 1,
        });
        schemas.set(`${type.name}@${type.version}`, zod);
        const migrations = Object.fromEntries(Object.entries(opts.migrate ?? {}));
        const p = remote.register(type.name, type.schema, type.version, migrations);
        p.catch(() => undefined);
        ready.set(type.name, p);
        return type;
      },
      get: async (type, id, opts) => {
        await own(type);
        return (await remote.get(type.name, id, opts)) as never;
      },
      query: async (type, q) => {
        await own(type);
        return (await remote.query(type.name, q)) as never;
      },
      search: async (types, text, opts) => {
        await Promise.all(types.map(own));
        return (await remote.search(
          types.map((t) => t.name),
          text,
          opts,
        )) as never;
      },
      async create(type, value) {
        await own(type);
        const { id, ...fields } = value as { id?: string } & Record<string, unknown>;
        const data = shape(type, fields);
        return (await remote.create(type.name, id === undefined ? data : { ...data, id })) as never;
      },
      async update(type, id, change) {
        await own(type);
        for (let i = 1; ; i++) {
          // biome-ignore lint/performance/noAwaitInLoops: each try reads what the last one missed
          const current = (await remote.get(type.name, id)) as Rec<z.ZodRawShape> | undefined;
          if (!current) throw new Error(`${type.name}: no record ${id}`);
          const data = shape(type, await change(current as never));
          try {
            return (await remote.replace(type.name, current.id, data, current.meta.rev)) as never;
          } catch (e) {
            if (!isConflict(e) || i === TRIES) throw e;
          }
        }
      },
      delete: async (type, id) => {
        await own(type);
        return remote.delete(type.name, id);
      },
      restore: async (type, id) => {
        await own(type);
        return (await remote.restore(type.name, id)) as never;
      },
      merge: async (type, keep, merge) => {
        await own(type);
        return (await remote.merge(type.name, keep, merge)) as never;
      },
      history: async (type, id) => {
        await own(type);
        return (await remote.history(type.name, id)) as never;
      },
      onChanged: async (type, handler) => {
        await own(type);
        return remote.onChanged(type.name, handler as never);
      },
      revert: async (type, version) => {
        await own(type);
        return remote.revert(type.name, version);
      },
    };
  },
});

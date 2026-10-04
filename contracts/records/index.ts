// Records: typed data every extension keeps through one storage provider, each in its own namespace
// (ARCHITECTURE.md, "A contract: records"). A type is registered by name once and then passed around
// as a handle, so another extension refers to it by the handle a contract gives it, never by a string.
//
// Handles are plain data (they cross sandboxes): the name, the fields as JSON Schema, the version. The
// client below turns Zod fields into that, validates puts before they leave, and keeps registerType
// synchronous. An extension may read any type it has a handle for, and write only its own.
//
// A type's version goes up with a change to its fields, with a migration from each older version. The
// provider runs migrations once, keeps every record's previous version, and can revert to it: data is
// never just overwritten.
import { defineContract } from '@pip/kernel';
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

export interface Meta {
  id: string;
  type: string;
  created: string;
  updated: string;
  /** The type's version this record is at. */
  v: number;
}
export type Rec<S extends z.ZodRawShape> = z.output<z.ZodObject<S>> & Meta;
export type Input<S extends z.ZodRawShape> = z.input<z.ZodObject<S>> & { id?: string };
export type Stored = Record<string, unknown> & Meta;

export interface Where {
  /** Created at or after, and before: ISO dates or date-times. */
  since?: string;
  until?: string;
  limit?: number;
  order?: 'newest' | 'oldest';
}

export type Change = Stored | { id: string; type: string; deleted: true };
type Migration = (
  old: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** What a provider implements, per calling extension (`perCaller`). */
export interface RecordsWire {
  register: (
    name: string,
    schema: JsonSchema,
    version: number,
    migrations: Record<string, Migration>,
  ) => Promise<void>;
  get: (type: string, id: string) => Promise<Stored | undefined>;
  query: (type: string, where?: Where) => Promise<Stored[]>;
  /** Records of `types` whose text fields contain every word of `text`. */
  search: (types: string[], text: string) => Promise<Stored[]>;
  /** Creates, or with an `id` replaces, a record of one of the caller's own types. */
  put: (type: string, value: Record<string, unknown>) => Promise<Stored>;
  delete: (type: string, id: string) => Promise<void>;
  /** Folds `merge` into `keep` (keep's fields win); `merge`'s id then reads as `keep`. */
  merge: (type: string, keep: string, merge: string) => Promise<Stored>;
  onChanged: (type: string, handler: (change: Change) => void) => Promise<Unsubscribe>;
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
  get: <S extends z.ZodRawShape>(type: RecordType<S>, id: string) => Promise<Rec<S> | undefined>;
  query: <S extends z.ZodRawShape>(type: RecordType<S>, where?: Where) => Promise<Rec<S>[]>;
  search: (types: RecordType[], text: string) => Promise<Stored[]>;
  put: <S extends z.ZodRawShape>(type: RecordType<S>, value: Input<S>) => Promise<Rec<S>>;
  delete: (type: RecordType, id: string) => Promise<void>;
  merge: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    keep: string,
    merge: string,
  ) => Promise<Rec<S>>;
  onChanged: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    handler: (change: Rec<S> | { id: string; type: string; deleted: true }) => void,
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
const fn = z.custom<(...args: never[]) => unknown>((f) => typeof f === 'function', {
  message: 'not a function',
});
const WhereSchema = z.object({
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.number().int().positive().optional(),
  order: z.enum(['newest', 'oldest']).optional(),
});

const schemas = new Map<string, z.ZodType>();
/** The Zod schema for a handle's fields, made once per type and version. */
export function schemaOf(type: RecordType): z.ZodType {
  const key = `${type.name}@${type.version}`;
  if (!schemas.has(key)) schemas.set(key, z.fromJSONSchema(type.schema as never));
  return schemas.get(key)!;
}

export const records = defineContract<RecordsV1, RecordsWire>({
  name: 'records',
  version: '1.0.0',
  inputs: {
    register: z.tuple([
      z.string().regex(/^[a-z][a-z0-9-]*$/, { message: 'lowercase words joined by dashes' }),
      z.record(z.string(), z.unknown()),
      z.number().int().positive(),
      z.record(z.string(), fn),
    ]),
    get: z.tuple([TypeName, z.string()]),
    query: z.tuple([TypeName, WhereSchema.optional()]),
    search: z.tuple([z.array(TypeName), z.string()]),
    put: z.tuple([TypeName, z.record(z.string(), z.unknown())]),
    delete: z.tuple([TypeName, z.string()]),
    merge: z.tuple([TypeName, z.string(), z.string()]),
    onChanged: z.tuple([TypeName, fn]),
    revert: z.tuple([TypeName, z.number().int().positive()]),
  },
  client(remote, { caller }) {
    // Registration is sent at once; anything done with the type waits for it (a migration included).
    const ready = new Map<string, Promise<void>>();
    const own = (t: RecordType) => ready.get(t.name) ?? Promise.resolve();
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
        const p = remote.register(name, type.schema, type.version, migrations);
        p.catch(() => undefined);
        ready.set(type.name, p);
        return type;
      },
      get: async (type, id) => {
        await own(type);
        return (await remote.get(type.name, id)) as never;
      },
      query: async (type, where) => {
        await own(type);
        return (await remote.query(type.name, where)) as never;
      },
      search: async (types, text) => {
        await Promise.all(types.map(own));
        return remote.search(
          types.map((t) => t.name),
          text,
        );
      },
      async put(type, value) {
        await own(type);
        const { id, ...fields } = value as { id?: string } & Record<string, unknown>;
        const data = schemaOf(type).parse(fields) as Record<string, unknown>;
        return (await remote.put(type.name, id === undefined ? data : { ...data, id })) as never;
      },
      delete: async (type, id) => {
        await own(type);
        return remote.delete(type.name, id);
      },
      merge: async (type, keep, merge) => {
        await own(type);
        return (await remote.merge(type.name, keep, merge)) as never;
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

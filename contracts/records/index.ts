// Records: typed data every extension keeps through one storage provider, in its own namespace. A type is
// registered by name once and then passed around as a handle, so another extension refers to it by
// importing the handle from a contract (wiki's `person`), never by a string.
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export const RecordRef = z.object({ type: z.string(), id: z.string() });
export type RecordRef = z.infer<typeof RecordRef>;

export interface RecordType<S extends z.ZodRawShape> {
  readonly kind: 'record-type';
  /** `extension/name`: the namespace is the registering extension's id. */
  readonly name: string;
  readonly schema: z.ZodObject<S>;
  /** A reference to a record of this type, for another type's fields. */
  ref: () => z.ZodType<RecordRef>;
}

export interface Meta {
  id: string;
  type: string;
  created: string;
  updated: string;
}
export type Rec<S extends z.ZodRawShape> = z.infer<z.ZodObject<S>> & Meta;
export type Input<S extends z.ZodRawShape> = z.input<z.ZodObject<S>> & { id?: string };

export interface Where {
  /** Created at or after, an ISO date or date-time. */
  since?: string;
  limit?: number;
  order?: 'newest' | 'oldest';
}

export type Unsubscribe = () => void;

export interface RecordsV1 {
  registerType: <S extends z.ZodRawShape>(name: string, fields: S) => RecordType<S>;
  get: <S extends z.ZodRawShape>(type: RecordType<S>, id: string) => Promise<Rec<S> | undefined>;
  query: <S extends z.ZodRawShape>(type: RecordType<S>, where?: Where) => Promise<Rec<S>[]>;
  /** Records of `types` whose string fields contain every word of `text`. */
  search: (types: RecordType<z.ZodRawShape>[], text: string) => Promise<Rec<z.ZodRawShape>[]>;
  /** Creates, or with an `id` replaces, a record; the value is checked against the type. */
  put: <S extends z.ZodRawShape>(type: RecordType<S>, value: Input<S>) => Promise<Rec<S>>;
  onChanged: <S extends z.ZodRawShape>(
    type: RecordType<S>,
    handler: (rec: Rec<S>) => void,
  ) => Unsubscribe;
}

const fn = z.custom<(...args: never[]) => unknown>((f) => typeof f === 'function', {
  message: 'not a function',
});
const TypeName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, { message: 'lowercase words joined by dashes' });
const isZod = (v: unknown) => typeof v === 'object' && v !== null && '_zod' in v;
const Handle = z.custom<RecordType<z.ZodRawShape>>(
  (v) => (v as RecordType<z.ZodRawShape> | null)?.kind === 'record-type',
  { message: 'not a record type handle' },
);
const Fields = z.record(z.string(), z.custom<z.ZodType>(isZod, { message: 'not a Zod schema' }));
const WhereSchema = z.object({
  since: z.string().optional(),
  limit: z.number().int().positive().optional(),
  order: z.enum(['newest', 'oldest']).optional(),
});

export const records = defineContract<RecordsV1>({
  name: 'records',
  version: '1.0.0',
  inputs: {
    registerType: z.tuple([TypeName, Fields]),
    get: z.tuple([Handle, z.string()]),
    query: z.tuple([Handle, WhereSchema.optional()]),
    search: z.tuple([z.array(Handle), z.string()]),
    put: z.tuple([Handle, z.record(z.string(), z.unknown())]),
    onChanged: z.tuple([Handle, fn]),
  },
});

/** For providers: the handle for a type named `name` (already namespaced). */
export function recordType<S extends z.ZodRawShape>(name: string, fields: S): RecordType<S> {
  return Object.freeze({
    kind: 'record-type',
    name,
    schema: z.object(fields),
    ref: () => RecordRef.extend({ type: z.literal(name) }),
  });
}

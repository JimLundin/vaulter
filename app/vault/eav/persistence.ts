import { z } from 'zod';
import { serial } from '../../runtime/async.ts';
import { encodeJson } from './json.ts';
import { checkCompatibility, type Schema, type AttributeSchema } from './schema.ts';
import {
  MemoryStorage,
  readStorage,
  publish,
  applyFacts,
  ConflictError,
  type Commit,
  type SchemaRevision,
  type Snapshot,
  type Atom,
  atomKey,
  isLive,
  recordType,
} from './memory.ts';

export interface Journal {
  readonly schemas: readonly SchemaRevision[];
  readonly commits: readonly Commit[];
}
export interface AppendRequest {
  readonly base: string | null;
  readonly schemas: readonly SchemaRevision[];
  readonly commit: Commit;
}
/** An adapter must atomically compare base, retain immutable requests and reconcile retries. */
export interface StorageAdapter {
  readonly scope: string;
  readonly load: () => Promise<Journal>;
  readonly append: (request: AppendRequest) => Promise<void>;
  readonly close?: () => void;
  readonly clear?: () => Promise<void>;
}
const closed = new WeakSet<MemoryStorage>();
export const storageClosed = (storage: MemoryStorage) => closed.has(storage);
const adapters = new WeakMap<
  MemoryStorage,
  { adapter: StorageAdapter; queue: ReturnType<typeof serial> }
>();
export function createPersistentStorage(adapter: StorageAdapter): MemoryStorage {
  const storage = new MemoryStorage();
  adapters.set(storage, { adapter, queue: serial() });
  return storage;
}

const atom = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.strictObject({ ref: z.string().min(1), type: z.string().min(1) }),
  z.strictObject({
    json: z.string().refine((value) => {
      try {
        return encodeJson(JSON.parse(value)) === value;
      } catch {
        return false;
      }
    }),
  }),
]);
const attribution = z.strictObject({ id: z.string().min(1), type: z.string().min(1) }).nullable();
const commitSchema = z.strictObject({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  committedAt: z.number().finite(),
  schemaRevision: z.number().int().positive(),
  author: attribution,
  origin: attribution,
  facts: z.array(
    z.strictObject({
      entity: z.string().min(1),
      attribute: z.string().min(1),
      value: atom,
      added: z.boolean(),
    }),
  ),
});
const attribute = z.strictObject({
  key: z.string().optional(),
  name: z.string().optional(),
  kind: z.enum([
    'string',
    'number',
    'boolean',
    'datetime',
    'json',
    'enum',
    'ref',
    'set',
    'inverse',
  ]),
  optional: z.boolean(),
  values: z.array(z.string()).optional(),
  target: z.string().optional(),
  forward: z.string().optional(),
  member: z.unknown().optional(),
});
const journalSchema = z.strictObject({
  schemas: z.array(
    z.strictObject({
      revision: z.number().int().positive(),
      schema: z.array(z.strictObject({ name: z.string().min(1), attributes: z.array(attribute) })),
    }),
  ),
  commits: z.array(commitSchema),
});
export function parseJournal(value: unknown): Journal {
  const parsed = journalSchema.parse(value);
  const ids = new Set<string>();
  const journal = structuredClone(value) as Journal;
  for (const [index, revision] of journal.schemas.entries()) {
    if (revision.revision !== index + 1) throw new Error('Invalid schema revision order');
    validateSchema(revision.schema);
    if (index) checkCompatibility(journal.schemas[index - 1]!.schema, revision.schema);
  }
  let snapshot: Snapshot = new Map();
  for (const [index, commit] of parsed.commits.entries()) {
    if (
      commit.sequence !== index + 1 ||
      ids.has(commit.id) ||
      !parsed.schemas[commit.schemaRevision - 1]
    )
      throw new Error('Invalid EAV transaction history');
    ids.add(commit.id);
    const seen = new Set<string>();
    for (const fact of commit.facts) {
      const key = JSON.stringify([fact.entity, fact.attribute, atomKey(fact.value)]);
      if (seen.has(key)) throw new Error('Duplicate EAV fact');
      seen.add(key);
      const present =
        snapshot
          .get(fact.entity)
          ?.get(fact.attribute)
          ?.some((atom) => atomKey(atom) === atomKey(fact.value)) ?? false;
      if (fact.added === present)
        throw new Error('EAV fact does not change the preceding snapshot');
    }
    const next = applyFacts(snapshot, commit.facts);
    for (const [entity, record] of snapshot) {
      if (recordType(record) !== recordType(next.get(entity)!))
        throw new Error('Entity type changed');
    }
    validateSnapshot(next, journal.schemas[commit.schemaRevision - 1]!.schema);
    for (const actor of [commit.author, commit.origin])
      if (actor && (!isLive(next.get(actor.id)) || recordType(next.get(actor.id)!) !== actor.type))
        throw new Error('Invalid transaction attribution');
    snapshot = next;
  }
  return journal;
}

function validateSchema(schema: Schema) {
  const types = new Set(schema.map((type) => type.name));
  if (types.size !== schema.length) throw new Error('Duplicate EAV entity type');
  for (const type of schema) {
    if (type.name.startsWith('@')) throw new Error('Reserved EAV entity type');
    const names = new Set<string>();
    const keys = new Set<string>();
    for (const field of type.attributes) {
      if (
        !(field.name && field.key) ||
        field.key.startsWith('@') ||
        names.has(field.name) ||
        keys.has(field.key)
      )
        throw new Error('Invalid EAV attribute');
      names.add(field.name);
      keys.add(field.key);
      const member = field.kind === 'set' ? field.member : field;
      if (
        !(
          member &&
          ['string', 'number', 'boolean', 'datetime', 'json', 'enum', 'ref', 'inverse'].includes(
            member.kind,
          )
        )
      )
        throw new Error('Invalid EAV attribute kind');
      if ((member.kind === 'ref' || member.kind === 'inverse') && !types.has(member.target!))
        throw new Error('Unregistered reference type');
      if (
        member.kind === 'enum' &&
        (!member.values?.length || new Set(member.values).size !== member.values.length)
      )
        throw new Error('Invalid enum');
      if (field.kind === 'inverse') {
        const forward = schema
          .find((target) => target.name === field.target)
          ?.attributes.find((attribute) => attribute.key === field.forward);
        const reference = forward?.kind === 'set' ? forward.member : forward;
        if (reference?.kind !== 'ref' || reference.target !== type.name)
          throw new Error('Invalid inverse');
      }
    }
  }
}

function validAtom(value: Atom, field: Omit<AttributeSchema, 'key' | 'name'>): boolean {
  if (field.kind === 'json') return typeof value === 'object' && 'json' in value;
  if (field.kind === 'ref')
    return typeof value === 'object' && 'ref' in value && value.type === field.target;
  if (field.kind === 'enum') return typeof value === 'string' && !!field.values?.includes(value);
  if (field.kind === 'datetime')
    return typeof value === 'number' && Number.isFinite(new Date(value).getTime());
  return typeof value === field.kind;
}

function validateSnapshot(snapshot: Snapshot, schema: Schema) {
  for (const record of snapshot.values()) {
    if (
      record.get('@type')?.length !== 1 ||
      typeof record.get('@type')![0] !== 'string' ||
      record.get('@live')?.length !== 1 ||
      typeof record.get('@live')![0] !== 'boolean'
    )
      throw new Error('Invalid entity identity facts');
    const type = schema.find((entity) => entity.name === recordType(record));
    if (!type) throw new Error('Unknown entity type');
    for (const [key, values] of record) {
      if (key === '@type' || key === '@live') continue;
      const presence = key.startsWith('@has:');
      const field = type.attributes.find(
        (attribute) => attribute.key === (presence ? key.slice(5) : key),
      );
      if (!field || field.kind === 'inverse') throw new Error('Unknown stored EAV attribute');
      if (presence) {
        if (field.kind !== 'set' || values.length !== 1 || values[0] !== true)
          throw new Error('Invalid set presence');
      } else {
        if (field.kind !== 'set' && values.length !== 1)
          throw new Error('Invalid attribute cardinality');
        for (const value of values) {
          if (!validAtom(value, field.kind === 'set' ? field.member! : field))
            throw new Error('Invalid stored attribute value');
          if (
            isLive(record) &&
            typeof value === 'object' &&
            'ref' in value &&
            (!isLive(snapshot.get(value.ref)) ||
              recordType(snapshot.get(value.ref)!) !== value.type)
          )
            throw new Error('Unavailable EAV reference');
        }
      }
    }
    if (isLive(record))
      for (const field of type.attributes)
        if (
          !field.optional &&
          field.kind !== 'inverse' &&
          !record.has(field.key) &&
          !(field.kind === 'set' && record.has(`@has:${field.key}`))
        )
          throw new Error('Missing required EAV attribute');
  }
}

export async function refreshStorage(storage: MemoryStorage): Promise<void> {
  if (closed.has(storage)) throw new Error('EAV storage is closed');
  const owned = adapters.get(storage);
  if (!owned) return;
  await owned.queue(async () => {
    const journal = parseJournal(await owned.adapter.load());
    const current = readStorage(storage);
    for (const [index, commit] of current.commits.entries())
      if (encodeJson(journal.commits[index]) !== encodeJson(commit))
        throw new Error('Accepted EAV history was removed or rewritten');
    if (journal.commits.length === current.commits.length) return;
    let snapshot = current.current;
    for (const commit of journal.commits.slice(current.commits.length))
      snapshot = applyFacts(snapshot, commit.facts);
    publish(storage, current.generation, {
      schemas: journal.schemas,
      commits: journal.commits,
      current: snapshot,
    });
  });
}

/** Retains the exact publication, never reruns the transaction callback. */
export class SaveError extends Error {
  override readonly name = 'SaveError';
  readonly retry: () => Promise<void>;
  constructor(cause: unknown, retry: () => Promise<void>) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.retry = retry;
  }
}

export async function persist(
  storage: MemoryStorage,
  expected: number,
  commit: Commit,
  accepted: () => void,
): Promise<void> {
  const owned = adapters.get(storage);
  if (!owned) {
    accepted();
    return;
  }
  const base = readStorage(storage);
  const request = structuredClone({
    base: base.commits.at(-1)?.id ?? null,
    schemas: base.schemas,
    commit,
  });
  let complete = false;
  const attempt = () =>
    owned.queue(async () => {
      if (complete) return;
      if (closed.has(storage)) throw new Error('EAV storage is closed');
      const existing = readStorage(storage).commits.find((item) => item.id === commit.id);
      if (existing) {
        if (encodeJson(existing) !== encodeJson(commit))
          throw new Error('EAV transaction identity was reused');
        complete = true;
        return;
      }
      if (readStorage(storage).generation !== expected) throw new ConflictError();
      try {
        await owned.adapter.append(request);
        accepted();
        complete = true;
      } catch (error) {
        if (error instanceof ConflictError) throw error;
        throw new SaveError(error, attempt);
      }
    });
  await attempt();
}

export function storageScope(storage: MemoryStorage): string | undefined {
  return adapters.get(storage)?.adapter.scope;
}
export function closeStorage(storage: MemoryStorage): void {
  closed.add(storage);
  adapters.get(storage)?.adapter.close?.();
}

export async function clearStorage(storage: MemoryStorage): Promise<void> {
  const owned = adapters.get(storage);
  await owned?.queue(() => owned.adapter.clear?.() ?? Promise.resolve());
}

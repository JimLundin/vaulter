import type { Schema } from './schema.ts';

export type Atom = string | number | boolean | { readonly ref: string; readonly type: string };
export type RecordState = ReadonlyMap<string, readonly Atom[]>;
export type Snapshot = ReadonlyMap<string, RecordState>;
export interface Fact {
  readonly entity: string;
  readonly attribute: string;
  readonly value: Atom;
  readonly added: boolean;
}
export interface Attribution {
  readonly id: string;
  readonly type: string;
}
export interface Commit {
  readonly id: string;
  readonly sequence: number;
  readonly committedAt: number;
  readonly schemaRevision: number;
  readonly author: Attribution | null;
  readonly origin: Attribution | null;
  readonly facts: readonly Fact[];
}
export interface SchemaRevision {
  readonly revision: number;
  readonly schema: Schema;
}
export interface StoredDatabase {
  readonly generation: number;
  readonly schemas: readonly SchemaRevision[];
  readonly commits: readonly Commit[];
  readonly current: Snapshot;
}

export const typeAttribute = '@type';
export const liveAttribute = '@live';
export function recordType(record: RecordState): string {
  return record.get(typeAttribute)![0] as string;
}
export function isLive(record: RecordState | undefined): record is RecordState {
  return record?.get(liveAttribute)?.[0] === true;
}
export function atomKey(atom: Atom): string {
  if (typeof atom === 'object') return `r:${atom.type.length}:${atom.type}:${atom.ref}`;
  return `${typeof atom}:${String(atom)}`;
}
export function sameValues(left: readonly Atom[] = [], right: readonly Atom[] = []): boolean {
  return (
    left.length === right.length && left.every((atom, i) => atomKey(atom) === atomKey(right[i]!))
  );
}

export function applyFacts(snapshot: Snapshot, facts: readonly Fact[]): Snapshot {
  const result = new Map(snapshot);
  for (const fact of facts) {
    const record = new Map(result.get(fact.entity));
    const values = record.get(fact.attribute) ?? [];
    const key = atomKey(fact.value);
    const next = fact.added
      ? [...values.filter((value) => atomKey(value) !== key), fact.value]
      : values.filter((value) => atomKey(value) !== key);
    if (next.length)
      record.set(
        fact.attribute,
        next.sort((a, b) => atomKey(a).localeCompare(atomKey(b))),
      );
    else record.delete(fact.attribute);
    result.set(fact.entity, record);
  }
  return result;
}

export function changes(before: Snapshot, after: Snapshot, touched: ReadonlySet<string>): Fact[] {
  const result: Fact[] = [];
  for (const entity of touched) {
    const old = before.get(entity) ?? new Map<string, readonly Atom[]>();
    const next = after.get(entity) ?? new Map<string, readonly Atom[]>();
    for (const attribute of new Set([...old.keys(), ...next.keys()])) {
      const oldValues = old.get(attribute) ?? [];
      const newValues = next.get(attribute) ?? [];
      const oldKeys = new Set(oldValues.map(atomKey));
      const newKeys = new Set(newValues.map(atomKey));
      for (const value of oldValues)
        if (!newKeys.has(atomKey(value))) result.push({ entity, attribute, value, added: false });
      for (const value of newValues)
        if (!oldKeys.has(atomKey(value))) result.push({ entity, attribute, value, added: true });
    }
  }
  return result;
}

export class ConflictError extends Error {
  override readonly name = 'ConflictError';
  constructor() {
    super('The database changed during this transaction');
  }
}

const databases = new WeakMap<MemoryStorage, StoredDatabase>();
const observers = new WeakMap<MemoryStorage, Set<() => void>>();

/** A concrete volatile backend. Reusing it across handles retains schema and transaction history. */
export class MemoryStorage {
  constructor() {
    databases.set(this, { generation: 0, schemas: [], commits: [], current: new Map() });
    observers.set(this, new Set());
  }
  /** Detached diagnostic/export data; this is not the application's entity interface. */
  inspect() {
    const { schemas, commits } = readStorage(this);
    return structuredClone({ schemas, transactions: commits });
  }
}
export function createMemoryStorage(): MemoryStorage {
  return new MemoryStorage();
}
export function readStorage(storage: MemoryStorage): StoredDatabase {
  return databases.get(storage)!;
}
export function publish(
  storage: MemoryStorage,
  expected: number,
  next: Omit<StoredDatabase, 'generation'>,
): void {
  if (readStorage(storage).generation !== expected) throw new ConflictError();
  databases.set(storage, { ...next, generation: expected + 1 });
  for (const observer of observers.get(storage)!) {
    try {
      observer();
    } catch {
      /* Publication cannot be undone by an observer failure. */
    }
  }
}
export function observe(storage: MemoryStorage, observer: () => void): () => void {
  observers.get(storage)!.add(observer);
  return () => {
    observers.get(storage)!.delete(observer);
  };
}
export function snapshotAt(storage: MemoryStorage, sequence: number): Snapshot {
  const stored = readStorage(storage);
  if (sequence === stored.commits.length) return stored.current;
  let snapshot: Snapshot = new Map();
  for (const commit of stored.commits) {
    if (commit.sequence > sequence) break;
    snapshot = applyFacts(snapshot, commit.facts);
  }
  return snapshot;
}

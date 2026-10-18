import { z } from 'zod';
import { storageScope } from './persistence.ts';
import { identify, materialize } from './identity.ts';
import {
  isLive,
  recordType,
  readStorage,
  snapshotAt,
  type JournalStorage,
  type Commit,
} from './memory.ts';
import type { HistoricalReference, RetainedStateReference } from './types.ts';

const referenceSchema = z.strictObject({
  format: z.literal('vaulter-eav-snapshot-v1'),
  scope: z.string().min(1),
  journal: z.string().min(1),
  transaction: z.string().min(1),
  entity: z.string().min(1),
  type: z.string().min(1),
});
const retainedStateSchema = referenceSchema.extend({
  format: z.literal('vaulter-eav-retained-state-v1'),
});
const memoryScopes = new WeakMap<JournalStorage, string>();
function scopeOf(storage: JournalStorage): string {
  const persistent = storageScope(storage);
  if (persistent !== undefined) return persistent;
  let scope = memoryScopes.get(storage);
  if (!scope) {
    scope = crypto.randomUUID();
    memoryScopes.set(storage, scope);
  }
  return scope;
}

function validateTarget(storage: JournalStorage, commit: Commit, id: string, type: string) {
  const record = snapshotAt(storage, commit.sequence).get(id);
  if (!isLive(record) || recordType(record) !== type)
    throw new Error('Historical reference target is unavailable in its snapshot');
}

export function captureReference(
  storage: JournalStorage,
  commit: Commit,
  value: unknown,
): HistoricalReference {
  const identity = identify(storage, value);
  validateTarget(storage, commit, identity.id, identity.type);
  return Object.freeze({
    format: 'vaulter-eav-snapshot-v1',
    scope: scopeOf(storage),
    journal: readStorage(storage).commits[0]!.id,
    transaction: commit.id,
    entity: identity.id,
    type: identity.type,
  });
}

export function resolveReference(storage: JournalStorage, value: unknown) {
  const reference = referenceSchema.parse(value);
  const stored = readStorage(storage);
  if (reference.scope !== scopeOf(storage) || reference.journal !== stored.commits[0]?.id)
    throw new Error('Historical reference belongs to another database');
  const commit = stored.commits.find((item) => item.id === reference.transaction);
  if (!commit) throw new Error('Historical reference transaction is not committed');
  validateTarget(storage, commit, reference.entity, reference.type);
  return {
    commit,
    entity: materialize(
      { database: storage, id: reference.entity, type: reference.type, sequence: commit.sequence },
      {},
    ),
  };
}

export function captureRetainedStateReference(
  storage: JournalStorage,
  commit: Commit,
  value: unknown,
): RetainedStateReference {
  const identity = identify(storage, value);
  const record = snapshotAt(storage, commit.sequence).get(identity.id);
  if (!record || recordType(record) !== identity.type)
    throw new Error('Retained state reference target is unavailable in its snapshot');
  return Object.freeze({
    format: 'vaulter-eav-retained-state-v1',
    scope: scopeOf(storage),
    journal: readStorage(storage).commits[0]!.id,
    transaction: commit.id,
    entity: identity.id,
    type: identity.type,
  });
}

export function resolveRetainedStateReference(storage: JournalStorage, value: unknown) {
  const reference = retainedStateSchema.parse(value);
  const stored = readStorage(storage);
  if (reference.scope !== scopeOf(storage) || reference.journal !== stored.commits[0]?.id)
    throw new Error('Retained state reference belongs to another database');
  const commit = stored.commits.find((item) => item.id === reference.transaction);
  if (!commit) throw new Error('Retained state reference transaction is not committed');
  const record = snapshotAt(storage, commit.sequence).get(reference.entity);
  if (!record || recordType(record) !== reference.type)
    throw new Error('Retained state reference target is unavailable in its snapshot');
  return {
    commit,
    state: isLive(record) ? ('live' as const) : ('deleted' as const),
    entity: materialize(
      { database: storage, id: reference.entity, type: reference.type, sequence: commit.sequence },
      {},
    ),
  };
}

import { z } from 'zod';
import { storageScope } from './persistence.ts';
import { identify, materialize } from './identity.ts';
import {
  isLive,
  recordType,
  readStorage,
  snapshotAt,
  type MemoryStorage,
  type Commit,
} from './memory.ts';
import type { HistoricalReference } from './types.ts';

const referenceSchema = z.strictObject({
  format: z.literal('vaulter-eav-snapshot-v1'),
  scope: z.string().min(1),
  journal: z.string().min(1),
  transaction: z.string().min(1),
  entity: z.string().min(1),
  type: z.string().min(1),
});
const memoryScopes = new WeakMap<MemoryStorage, string>();
function scopeOf(storage: MemoryStorage): string {
  const persistent = storageScope(storage);
  if (persistent !== undefined) return persistent;
  let scope = memoryScopes.get(storage);
  if (!scope) {
    scope = crypto.randomUUID();
    memoryScopes.set(storage, scope);
  }
  return scope;
}

function validateTarget(storage: MemoryStorage, commit: Commit, id: string, type: string) {
  const record = snapshotAt(storage, commit.sequence).get(id);
  if (!isLive(record) || recordType(record) !== type)
    throw new Error('Historical reference target is unavailable in its snapshot');
}

export function captureReference(
  storage: MemoryStorage,
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

export function resolveReference(storage: MemoryStorage, value: unknown) {
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

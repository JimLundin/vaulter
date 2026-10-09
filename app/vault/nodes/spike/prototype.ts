// PROTOTYPE: shared acceptance logic and two stores. No production wiring or remote synchronization.
import { Dexie } from 'dexie';
import type { NodeVersion, Transaction } from '../model.ts';
import type { NodeChange, NodeCommit, NodeDifference, NodeSnapshot, NodeStore } from '../store.ts';
import { decryptJson, encryptJson, newCacheKey, type Encrypted } from '../../session/crypto.ts';

interface Accepted {
  readonly transaction: Transaction;
  readonly versions: readonly NodeVersion[];
  readonly fingerprint: string;
}

export interface SpikeStore extends NodeStore {
  readonly reset: () => Promise<void>;
  readonly close: () => void;
}

/** Canonical valid JSON doubles as a retry fingerprint in this small spike. */
function canonical(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || ancestors.has(value))
    throw new Error('Expected finite, acyclic JSON');
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return `[${value.map((item) => canonical(item, ancestors)).join(',')}]`;
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new Error('Expected plain JSON objects');
    return `{${Object.entries(value)
      .sort(([a], [b]) => compare(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item, ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotOf(records: readonly Accepted[], cutoff?: number): NodeSnapshot {
  const last = records.at(-1)?.transaction.sequence ?? 0;
  const sequence = cutoff ?? last;
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > last)
    throw new Error('Snapshot sequence is outside recorded history');
  const selected = new Map<string, NodeVersion>();
  for (const record of records)
    if (record.transaction.sequence <= sequence)
      for (const version of record.versions) selected.set(version.nodeId, version);
  return Object.freeze({
    sequence,
    get: (nodeId: string) => selected.get(nodeId),
    children: (parentNodeId: string) => {
      const parent = selected.get(parentNodeId);
      if (!parent || parent.data === null) return Object.freeze([]);
      return Object.freeze(
        [...selected.values()]
          .filter((v) => v.data !== null && v.parentNodeId === parentNodeId)
          .sort(
            (a, b) => compare(a.orderKey ?? '', b.orderKey ?? '') || compare(a.nodeId, b.nodeId),
          ),
      );
    },
  });
}

function accept(records: readonly Accepted[], request: NodeCommit): Accepted {
  const fingerprint = canonical(request);
  const prior = records.find((r) => r.transaction.id === request.id);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      throw new Error('Transaction ID reused with different contents');
    return prior;
  }
  if (!(request.id && request.changes.length))
    throw new Error('A transaction needs an ID and changes');
  if (typeof request.kind !== 'string' || !request.kind.trim())
    throw new Error('A transaction needs a nonempty operation kind');
  if (typeof request.recordedBy !== 'string' || !request.recordedBy.trim())
    throw new Error('A transaction needs an author');
  const current = snapshotOf(records);
  const selected = new Map<string, NodeVersion>();
  for (const r of records) for (const v of r.versions) selected.set(v.nodeId, v);
  const changed = new Set<string>();
  const expect = (nodeId: string, transactionId: string | null) => {
    if ((current.get(nodeId)?.transactionId ?? null) !== transactionId)
      throw new Error(`Conflict: ${nodeId} changed since ${transactionId ?? 'creation'}`);
  };
  for (const [nodeId, transactionId] of Object.entries(request.expectedReads ?? {}))
    expect(nodeId, transactionId);
  const versions = request.changes.map((change): NodeVersion => {
    if (!change.nodeId || changed.has(change.nodeId))
      throw new Error('Duplicate or empty node identity');
    changed.add(change.nodeId);
    expect(change.nodeId, change.expectedTransactionId);
    if (change.data === null && !current.get(change.nodeId))
      throw new Error('Cannot delete a new identity');
    if (change.data !== null && (typeof change.data !== 'object' || Array.isArray(change.data)))
      throw new Error('Node data must be a JSON object or deletion');
    if ((change.parentNodeId === null) !== (change.orderKey === null))
      throw new Error('Parent and order key must agree');
    if (change.orderKey !== null && !change.orderKey) throw new Error('Order key must be nonempty');
    return {
      nodeId: change.nodeId,
      transactionId: request.id,
      parentNodeId: change.parentNodeId,
      targetNodeId: change.targetNodeId,
      orderKey: change.orderKey,
      data: change.data,
    };
  });
  for (const version of versions) selected.set(version.nodeId, version);
  for (const version of versions)
    for (const ref of [version.parentNodeId, version.targetNodeId])
      if (ref !== null && !selected.has(ref)) throw new Error(`Unknown node identity: ${ref}`);
  if (!selected.has(request.recordedBy)) throw new Error('Unknown transaction author');
  if (request.originNodeId !== null && !selected.has(request.originNodeId))
    throw new Error('Unknown originating node');
  if (
    request.undoOfTransactionId !== null &&
    !records.some((r) => r.transaction.id === request.undoOfTransactionId)
  )
    throw new Error('Unknown undo transaction');
  // Only containment is acyclic. Target references may form ordinary graph cycles.
  const checked = new Set<string>();
  for (const version of selected.values()) {
    const path = new Set<string>();
    let cursor: NodeVersion | undefined = version;
    while (cursor && cursor.data !== null && !checked.has(cursor.nodeId)) {
      if (path.has(cursor.nodeId)) throw new Error('Containment cycle');
      path.add(cursor.nodeId);
      cursor = cursor.parentNodeId === null ? undefined : selected.get(cursor.parentNodeId);
    }
    for (const id of path) checked.add(id);
  }
  return frozen(
    structuredClone({
      transaction: {
        id: request.id,
        sequence: current.sequence + 1,
        recordedAt: new Date().toISOString(),
        recordedBy: request.recordedBy,
        message: request.message,
        kind: request.kind,
        originNodeId: request.originNodeId,
        undoOfTransactionId: request.undoOfTransactionId,
      },
      versions,
      fingerprint,
    }),
  );
}

function interfaceOf(
  read: () => Promise<readonly Accepted[]>,
  append: (request: NodeCommit) => Promise<Accepted>,
  watch: (notify: () => void) => () => void,
  reset: () => Promise<void>,
  close: () => void,
): SpikeStore {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      // A broken observer must not make a durable commit look rejected.
      try {
        listener();
      } catch {
        /* This scratch demo ignores observer failures. */
      }
    }
  };
  const unwatch = watch(notify);
  return {
    commit: async (request) => {
      const copy = structuredClone(request);
      canonical(copy);
      return (await append(frozen(copy))).transaction;
    },
    snapshot: async (sequence) => snapshotOf(await read(), sequence),
    history: async (options = {}) =>
      (await read())
        .map((r) => r.transaction)
        .filter(
          (t) =>
            t.sequence < (options.beforeSequence ?? Number.POSITIVE_INFINITY) &&
            (!options.kinds || options.kinds.includes(t.kind)),
        )
        .reverse()
        .slice(0, options.limit ?? 50),
    changes: async (transactionId) => {
      const records = await read();
      const record = records.find((r) => r.transaction.id === transactionId);
      if (!record) throw new Error('Unknown transaction');
      const before = snapshotOf(records, record.transaction.sequence - 1);
      return Object.freeze(
        record.versions.map(
          (after): NodeDifference =>
            Object.freeze({
              nodeId: after.nodeId,
              before: before.get(after.nodeId) ?? null,
              after,
            }),
        ),
      );
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: async () => {
      await reset();
      notify();
    },
    close: () => {
      unwatch();
      listeners.clear();
      close();
    },
  };
}

/** Copy-on-accept Map store; every committed state and snapshot remains immutable. */
export function memorySpikeStore(): SpikeStore {
  let log = new Map<string, Accepted>();
  let notify: () => void = () => undefined;
  return interfaceOf(
    () => Promise.resolve([...log.values()]),
    (request) =>
      Promise.resolve().then(() => {
        const record = accept([...log.values()], request);
        if (!log.has(record.transaction.id)) {
          log = new Map(log).set(record.transaction.id, record);
          notify();
        }
        return record;
      }),
    (listener) => {
      notify = listener;
      return () => {
        notify = () => undefined;
      };
    },
    () => {
      log = new Map();
      return Promise.resolve();
    },
    () => undefined,
  );
}

interface TransactionRow extends Encrypted {
  id: string;
  sequence: number;
}
interface VersionRow extends Encrypted {
  nodeId: string;
  transactionId: string;
}
interface Counter {
  id: string;
  sequence: number;
}
interface KeyRow {
  id: string;
  key: CryptoKey;
}

function spikeDatabase(name: string) {
  const db = new Dexie(name);
  db.version(1).stores({
    nodes: 'id',
    transactions: 'id,&sequence',
    versions: '[nodeId+transactionId],transactionId,nodeId',
    current: 'nodeId',
    state: 'id',
    keys: 'id',
  });
  return {
    db,
    nodes: db.table<{ id: string }, string>('nodes'),
    transactions: db.table<TransactionRow, string>('transactions'),
    versions: db.table<VersionRow, [string, string]>('versions'),
    current: db.table<VersionRow, string>('current'),
    state: db.table<Counter, string>('state'),
    keys: db.table<KeyRow, string>('keys'),
  };
}

/**
 * Scratch database only. Production must supply the unlocked session key and retention policy.
 * Parent/target/data stay encrypted; opaque identity, version membership and sequence are indexed.
 */
export async function dexieSpikeStore(
  name = 'PROTOTYPE-vaulter-node-storage-authorship-wipe-me',
): Promise<SpikeStore> {
  if (!name.startsWith('PROTOTYPE-')) throw new Error('Use a dedicated PROTOTYPE- database');
  const tables = spikeDatabase(name);
  const { db, transactions, versions, current, state, keys, nodes } = tables;
  const candidate = (await keys.get('scratch'))?.key ?? (await newCacheKey());
  const key = await db.transaction('rw', keys, async () => {
    const existing = await keys.get('scratch');
    if (existing) return existing.key;
    await keys.add({ id: 'scratch', key: candidate });
    return candidate;
  });
  const read = async (): Promise<readonly Accepted[]> => {
    const rows = await transactions.orderBy('sequence').toArray();
    const result = await Promise.all(
      rows.map(async (row) => {
        const record = await decryptJson<Accepted>(
          key,
          row,
          `transaction:${row.id}:${row.sequence}`,
        );
        if (record.transaction.id !== row.id || record.transaction.sequence !== row.sequence)
          throw new Error('Transaction metadata does not match encrypted record');
        return frozen(record);
      }),
    );
    return result;
  };
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
  let notify: () => void = () => undefined;
  const publish = () => {
    notify();
    channel?.postMessage('committed');
  };
  const append = async (request: NodeCommit): Promise<Accepted> => {
    // Crypto runs outside IDB. Recheck the log head inside the short atomic publication.
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: A conflict retry must re-read after the previous attempt.
      const records = await read();
      const base = records.at(-1)?.transaction.sequence ?? 0;
      const record = accept(records, request);
      if (records.some((r) => r.transaction.id === request.id)) return record;
      const transactionRow: TransactionRow = {
        id: record.transaction.id,
        sequence: record.transaction.sequence,
        ...(await encryptJson(
          key,
          record,
          `transaction:${record.transaction.id}:${record.transaction.sequence}`,
        )),
      };
      const versionRows = await Promise.all(
        record.versions.map(
          async (v): Promise<VersionRow> => ({
            nodeId: v.nodeId,
            transactionId: v.transactionId,
            ...(await encryptJson(
              key,
              v,
              `version:${JSON.stringify([v.nodeId, v.transactionId])}`,
            )),
          }),
        ),
      );
      const committed = await db.transaction(
        'rw',
        [nodes, transactions, versions, current, state],
        async () => {
          if (((await state.get('head'))?.sequence ?? 0) !== base) return false;
          const known = await nodes.bulkGet(record.versions.map((v) => v.nodeId));
          await nodes.bulkAdd(
            record.versions.filter((_, i) => known[i] === undefined).map((v) => ({ id: v.nodeId })),
          );
          await transactions.add(transactionRow);
          await versions.bulkAdd(versionRows);
          await current.bulkPut(versionRows);
          await state.put({ id: 'head', sequence: record.transaction.sequence });
          return true;
        },
      );
      if (committed) {
        publish();
        return record;
      }
      // An unrelated writer may advance the log; rebuild, revalidate and retry. Same-node edits conflict.
    }
  };
  return interfaceOf(
    read,
    append,
    (listener) => {
      notify = listener;
      if (channel) channel.onmessage = () => listener();
      return () => {
        notify = () => undefined;
        channel?.close();
      };
    },
    async () => {
      await db.transaction('rw', [nodes, transactions, versions, current, state], async () => {
        await Promise.all([
          nodes.clear(),
          transactions.clear(),
          versions.clear(),
          current.clear(),
          state.clear(),
        ]);
      });
      channel?.postMessage('committed');
    },
    () => db.close(),
  );
}

/** Live closure follows containment and targets; deleted nodes stop traversal. */
export function closure(snapshot: NodeSnapshot, rootId: string): readonly NodeVersion[] {
  const visited = new Set<string>();
  const result: NodeVersion[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const version = snapshot.get(id);
    if (!version || version.data === null) return;
    result.push(version);
    for (const child of snapshot.children(id)) visit(child.nodeId);
    if (version.targetNodeId !== null) visit(version.targetNodeId);
  };
  visit(rootId);
  return Object.freeze(result);
}

/** Guarded compensation; restoring a group reveals descendants at their current states. */
export async function undo(
  store: NodeStore,
  transactionId: string,
  recordedBy: string,
): Promise<Transaction> {
  const differences = await store.changes(transactionId);
  const changes: NodeChange[] = differences.map(({ nodeId, before, after }) => ({
    nodeId,
    expectedTransactionId: after.transactionId,
    parentNodeId: before?.parentNodeId ?? null,
    targetNodeId: before?.targetNodeId ?? null,
    orderKey: before?.orderKey ?? null,
    data: before?.data ?? null,
  }));
  return store.commit({
    id: crypto.randomUUID(),
    message: `Undo ${transactionId}`,
    kind: 'transaction.undo',
    recordedBy,
    originNodeId: null,
    undoOfTransactionId: transactionId,
    changes,
  });
}

/** Scratch inspection only: encrypted rows must expose no plaintext content or structural endpoints. */
export async function inspectScratch(name: string): Promise<Record<string, readonly unknown[]>> {
  const { db } = spikeDatabase(name);
  try {
    return Object.fromEntries(
      await Promise.all(
        ['nodes', 'transactions', 'versions', 'current', 'state'].map(async (tableName) => [
          tableName,
          await db.table(tableName).toArray(),
        ]),
      ),
    );
  } finally {
    db.close();
  }
}

export async function upgradeScratch(name: string): Promise<void> {
  const { db } = spikeDatabase(name);
  // Preserve all history while adding a new index.
  db.version(2).stores({ current: 'nodeId,transactionId' });
  try {
    await db.open();
  } finally {
    db.close();
  }
}

export function deleteScratch(name: string): Promise<void> {
  return Dexie.delete(name);
}

// PROTOTYPE: shared acceptance logic and two stores. No production wiring or remote synchronization.
import { Dexie } from 'dexie';
import type { NodeAddress, NodeVersion, Transaction } from '../model.ts';
import { sameOperation, transactionOperations } from '../operations.ts';
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
  const exact = new Map<string, NodeVersion>();
  for (const record of records)
    if (record.transaction.sequence <= sequence)
      for (const version of record.versions) {
        selected.set(version.key.node, version);
        exact.set(JSON.stringify([version.key.node, version.key.transaction]), version);
      }
  return Object.freeze({
    sequence,
    get: (node: string) => selected.get(node),
    resolve: (address: NodeAddress) =>
      address.transaction === undefined
        ? selected.get(address.node)
        : exact.get(JSON.stringify([address.node, address.transaction])),
    children: (parent: string) => {
      const enclosing = selected.get(parent);
      if (!enclosing || enclosing.data === null) return Object.freeze([]);
      return Object.freeze(
        [...selected.values()]
          .filter((v) => v.data !== null && v.placement?.parent === parent)
          .sort(
            (a, b) =>
              compare(a.placement?.order ?? '', b.placement?.order ?? '') ||
              compare(a.key.node, b.key.node),
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
  if (
    !request.kind ||
    typeof request.kind !== 'object' ||
    typeof request.kind.scope !== 'string' ||
    !request.kind.scope.trim() ||
    typeof request.kind.action !== 'string' ||
    !request.kind.action.trim() ||
    Object.keys(request.kind).some((key) => key !== 'scope' && key !== 'action')
  )
    throw new Error('A transaction needs a structured scope/action kind');
  if (
    request.metadata !== undefined &&
    (request.metadata === null ||
      typeof request.metadata !== 'object' ||
      Array.isArray(request.metadata))
  )
    throw new Error('Transaction metadata must be a JSON object');
  if (typeof request.recordedBy !== 'string' || !request.recordedBy.trim())
    throw new Error('A transaction needs an author');
  const current = snapshotOf(records);
  const selected = new Map<string, NodeVersion>();
  for (const r of records) for (const v of r.versions) selected.set(v.key.node, v);
  const changed = new Set<string>();
  const expect = (node: string, transaction: string | null) => {
    if ((current.get(node)?.key.transaction ?? null) !== transaction)
      throw new Error(`Conflict: ${node} changed since ${transaction ?? 'creation'}`);
  };
  for (const [node, transaction] of Object.entries(request.expectedReads ?? {}))
    expect(node, transaction);
  const versions = request.changes.map((change): NodeVersion => {
    if (!change.node || changed.has(change.node))
      throw new Error('Duplicate or empty node identity');
    changed.add(change.node);
    expect(change.node, change.expected);
    if (change.data === null && !current.get(change.node))
      throw new Error('Cannot delete a new identity');
    if (change.data !== null && (typeof change.data !== 'object' || Array.isArray(change.data)))
      throw new Error('Node data must be a JSON object or deletion');
    if (change.placement !== null) {
      if (
        !change.placement ||
        typeof change.placement !== 'object' ||
        typeof change.placement.parent !== 'string' ||
        !change.placement.parent.trim() ||
        typeof change.placement.order !== 'string' ||
        !change.placement.order
      )
        throw new Error('Placement needs a parent and nonempty order');
      if (Object.keys(change.placement).some((key) => key !== 'parent' && key !== 'order'))
        throw new Error('Unexpected placement field');
    }
    if (change.connection !== null) {
      if (
        !change.connection ||
        typeof change.connection !== 'object' ||
        Object.keys(change.connection).some((key) => key !== 'source' && key !== 'target')
      )
        throw new Error('Connection needs source and target addresses');
      for (const endpoint of [change.connection.source, change.connection.target]) {
        if (
          !endpoint ||
          typeof endpoint !== 'object' ||
          typeof endpoint.node !== 'string' ||
          !endpoint.node.trim() ||
          (endpoint.transaction !== undefined &&
            (typeof endpoint.transaction !== 'string' || !endpoint.transaction.trim())) ||
          Object.keys(endpoint).some((key) => key !== 'node' && key !== 'transaction')
        )
          throw new Error('Invalid node address');
      }
    }
    return {
      key: { node: change.node, transaction: request.id },
      placement: change.placement,
      connection: change.connection,
      data: change.data,
    };
  });
  for (const version of versions) selected.set(version.key.node, version);
  const exact = new Set(
    records.flatMap((r) => r.versions.map((v) => JSON.stringify([v.key.node, v.key.transaction]))),
  );
  for (const version of versions)
    exact.add(JSON.stringify([version.key.node, version.key.transaction]));
  for (const version of versions) {
    if (version.placement && !selected.has(version.placement.parent))
      throw new Error(`Unknown parent identity: ${version.placement.parent}`);
    if (version.connection)
      for (const endpoint of [version.connection.source, version.connection.target]) {
        if (!selected.has(endpoint.node))
          throw new Error(`Unknown node identity: ${endpoint.node}`);
        if (
          endpoint.transaction !== undefined &&
          !exact.has(JSON.stringify([endpoint.node, endpoint.transaction]))
        )
          throw new Error(`Unknown exact version: ${endpoint.node} in ${endpoint.transaction}`);
      }
  }
  if (!selected.has(request.recordedBy)) throw new Error('Unknown transaction author');
  if (request.origin !== null && !selected.has(request.origin))
    throw new Error('Unknown originating node');
  if (request.undoOf !== null && !records.some((r) => r.transaction.id === request.undoOf))
    throw new Error('Unknown undo transaction');
  // Only containment is acyclic. Target references may form ordinary graph cycles.
  const checked = new Set<string>();
  for (const version of selected.values()) {
    const path = new Set<string>();
    let cursor: NodeVersion | undefined = version;
    while (cursor && cursor.data !== null && !checked.has(cursor.key.node)) {
      if (path.has(cursor.key.node)) throw new Error('Containment cycle');
      path.add(cursor.key.node);
      cursor = cursor.placement === null ? undefined : selected.get(cursor.placement.parent);
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
        origin: request.origin,
        undoOf: request.undoOf,
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
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
            (!options.kinds || options.kinds.some((kind) => sameOperation(kind, t.kind))),
        )
        .reverse()
        .slice(0, options.limit ?? 50),
    changes: async (transaction) => {
      const records = await read();
      const record = records.find((r) => r.transaction.id === transaction);
      if (!record) throw new Error('Unknown transaction');
      const before = snapshotOf(records, record.transaction.sequence - 1);
      return Object.freeze(
        record.versions.map(
          (after): NodeDifference =>
            Object.freeze({
              node: after.key.node,
              before: before.get(after.key.node) ?? null,
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
  node: string;
  transaction: string;
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
    versions: '[node+transaction],transaction,node',
    current: 'node',
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
 * Placement/connection/data stay encrypted; opaque identity, version membership and sequence are indexed.
 */
export async function dexieSpikeStore(
  name = 'PROTOTYPE-vaulter-node-storage-addresses-wipe-me',
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
            node: v.key.node,
            transaction: v.key.transaction,
            ...(await encryptJson(
              key,
              v,
              `version:${JSON.stringify([v.key.node, v.key.transaction])}`,
            )),
          }),
        ),
      );
      const committed = await db.transaction(
        'rw',
        [nodes, transactions, versions, current, state],
        async () => {
          if (((await state.get('head'))?.sequence ?? 0) !== base) return false;
          const known = await nodes.bulkGet(record.versions.map((v) => v.key.node));
          await nodes.bulkAdd(
            record.versions
              .filter((_, i) => known[i] === undefined)
              .map((v) => ({ id: v.key.node })),
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

/** Containment and target closure in the viewing snapshot; exact addresses select only a version. */
export function closure(
  snapshot: NodeSnapshot,
  root: string | NodeAddress,
): readonly NodeVersion[] {
  const visited = new Set<string>();
  const result: NodeVersion[] = [];
  const visit = (address: NodeAddress) => {
    const version = snapshot.resolve(address);
    if (!version || version.data === null) return;
    const key = JSON.stringify([version.key.node, version.key.transaction]);
    if (visited.has(key)) return;
    visited.add(key);
    result.push(version);
    for (const child of snapshot.children(version.key.node)) visit({ node: child.key.node });
    if (version.connection !== null) visit(version.connection.target);
  };
  visit(typeof root === 'string' ? { node: root } : root);
  return Object.freeze(result);
}

/** Demo projection; ranges select the target's plain-text projection, without storing a quote. */
export function citationView(snapshot: NodeSnapshot, citation: NodeVersion) {
  const status = (address: NodeAddress) => {
    const recorded = snapshot.resolve(address);
    const current = snapshot.get(address.node);
    if (!recorded) return 'version unavailable';
    if (recorded.data === null) return 'cited version is deleted';
    if (current?.data === null) return 'deleted in this view';
    if (address.transaction !== undefined && current?.key.transaction !== address.transaction)
      return 'newer version in this view';
    return 'matches this view';
  };
  const { connection } = citation;
  const evidence = connection ? snapshot.resolve(connection.target) : undefined;
  const parts = evidence?.data?.parts;
  const text =
    typeof evidence?.data?.text === 'string'
      ? evidence.data.text
      : Array.isArray(parts)
        ? parts
            .map((part) =>
              part && typeof part === 'object' && 'text' in part ? String(part.text) : '',
            )
            .join('')
        : '';
  const range = citation.data?.range;
  const valid =
    range &&
    typeof range === 'object' &&
    !Array.isArray(range) &&
    'start' in range &&
    'end' in range &&
    'unit' in range &&
    range.unit === 'utf16' &&
    typeof range.start === 'number' &&
    Number.isInteger(range.start) &&
    range.start >= 0 &&
    typeof range.end === 'number' &&
    Number.isInteger(range.end) &&
    range.end >= range.start &&
    range.end <= text.length;
  return {
    quote: valid ? text.slice(Number(range.start), Number(range.end)) : '[selection unavailable]',
    source: connection ? status(connection.source) : 'no connection',
    target: connection ? status(connection.target) : 'no connection',
  };
}

/** Guarded compensation; restoring a group reveals descendants at their current states. */
export async function undo(
  store: NodeStore,
  transaction: string,
  recordedBy: string,
): Promise<Transaction> {
  const differences = await store.changes(transaction);
  const changes: NodeChange[] = differences.map(({ node, before, after }) => ({
    node,
    expected: after.key.transaction,
    placement: before?.placement ?? null,
    connection: before?.connection ?? null,
    data: before?.data ?? null,
  }));
  return store.commit({
    id: crypto.randomUUID(),
    message: `Undo ${transaction}`,
    kind: transactionOperations.undo,
    recordedBy,
    origin: null,
    undoOf: transaction,
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
  db.version(2).stores({ current: 'node,transaction' });
  try {
    await db.open();
  } finally {
    db.close();
  }
}

export function deleteScratch(name: string): Promise<void> {
  return Dexie.delete(name);
}

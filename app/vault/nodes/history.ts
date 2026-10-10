// Atomic acceptance and immutable projections shared by both adapters.
import type { NodeAddress, NodeVersion } from './model.ts';
import type { NodeCommit, NodeSnapshot, NodeDifference } from './store.ts';
import type { NodeRecord } from './validation.ts';
import { frozen, compare, canonical } from './json.ts';

export class NodeConflict extends Error {}

export function snapshotOf(records: readonly NodeRecord[], cutoff?: number): NodeSnapshot {
  const sequence = cutoff ?? records.at(-1)?.transaction.sequence ?? 0;
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    sequence > (records.at(-1)?.transaction.sequence ?? 0)
  )
    throw new Error('Snapshot is outside recorded history');
  const selected = new Map<string, NodeVersion>();
  const exact = new Map<string, NodeVersion>();
  const children = new Map<string, NodeVersion[]>();
  for (const record of records) {
    if (record.transaction.sequence > sequence) break;
    for (const version of record.versions) {
      selected.set(version.key.node, version);
      exact.set(JSON.stringify([version.key.node, version.key.transaction]), version);
    }
  }
  for (const version of selected.values()) {
    if (version.data === null || !version.placement) continue;
    const siblings = children.get(version.placement.parent) ?? [];
    siblings.push(version);
    children.set(version.placement.parent, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (a, b) => compare(a.placement!.order, b.placement!.order) || compare(a.key.node, b.key.node),
    );
    Object.freeze(siblings);
  }
  const empty = Object.freeze([]);
  const resolve = (address: NodeAddress) =>
    address.transaction === undefined
      ? selected.get(address.node)
      : exact.get(JSON.stringify([address.node, address.transaction]));
  return Object.freeze({
    sequence,
    get: (node: string) => selected.get(node),
    resolve,
    children: (parent: string | NodeAddress) => {
      const address = typeof parent === 'string' ? { node: parent } : parent;
      return resolve(address)?.data == null ? empty : (children.get(address.node) ?? empty);
    },
  });
}

export function accept(
  records: readonly NodeRecord[],
  request: NodeCommit,
  requestDigest: string,
  recordedAt: string,
): NodeRecord {
  const prior = records.find((r) => r.transaction.id === request.id);
  if (prior) {
    if (prior.requestDigest !== requestDigest)
      throw new Error('Transaction ID reused with different contents');
    return prior;
  }
  const current = snapshotOf(records);
  const selected = new Map<string, NodeVersion>();
  for (const r of records) for (const v of r.versions) selected.set(v.key.node, v);
  const changed = new Set<string>();
  const expect = (node: string, transaction: string | null) => {
    if ((current.get(node)?.key.transaction ?? null) !== transaction)
      throw new NodeConflict(`Conflict: ${node} changed since ${transaction ?? 'creation'}`);
  };
  for (const [node, transaction] of Object.entries(request.expectedReads ?? {}))
    expect(node, transaction);
  const versions = request.changes.map((change): NodeVersion => {
    if (changed.has(change.node)) throw new Error('Duplicate node identity');
    changed.add(change.node);
    expect(change.node, change.expected);
    if (change.data === null && !current.get(change.node))
      throw new Error('Cannot delete a new identity');
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
        recordedAt,
        recordedBy: request.recordedBy,
        message: request.message,
        kind: request.kind,
        origin: request.origin,
        undoOf: request.undoOf,
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      },
      versions,
      format: 1,
      requestDigest,
    }),
  );
}

/** Validate imported history before it becomes visible; append-only prefixes cannot be rewritten. */
export function validateRecords(
  values: readonly NodeRecord[],
  previous: readonly NodeRecord[] = [],
): readonly NodeRecord[] {
  if (values.length < previous.length) throw new Error('Recorded history was removed');
  const checked: NodeRecord[] = [];
  for (const record of values) {
    const sequence = checked.length + 1;
    if (record.transaction.sequence !== sequence) throw new Error('Noncontiguous node history');
    const prior = previous[sequence - 1];
    if (prior) {
      if (canonical(prior) !== canonical(record))
        throw new Error('Recorded transaction was rewritten');
      checked.push(prior);
      continue;
    }
    const current = snapshotOf(checked);
    const { sequence: _sequence, recordedAt, ...transaction } = record.transaction;
    const request: NodeCommit = {
      ...transaction,
      changes: record.versions.map(({ key, ...state }) => {
        if (key.transaction !== transaction.id)
          throw new Error('Version belongs to another transaction');
        return {
          ...state,
          node: key.node,
          expected: current.get(key.node)?.key.transaction ?? null,
        };
      }),
    };
    const accepted = accept(checked, request, record.requestDigest, recordedAt);
    if (accepted.transaction.sequence !== sequence)
      throw new Error('Duplicate transaction identity');
    checked.push(frozen(structuredClone(record)));
  }
  return Object.freeze(checked);
}

export function differences(
  records: readonly NodeRecord[],
  transaction: string,
): readonly NodeDifference[] {
  const record = records.find((value) => value.transaction.id === transaction);
  if (!record) throw new Error('Unknown transaction');
  const before = snapshotOf(records, record.transaction.sequence - 1);
  return Object.freeze(
    record.versions.map((after) =>
      Object.freeze({
        node: after.key.node,
        before: before.get(after.key.node) ?? null,
        after,
      }),
    ),
  );
}

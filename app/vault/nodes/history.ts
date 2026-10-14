// Atomic acceptance and immutable projections shared by both adapters.
import type { NodeAddress, NodeVersion } from './model.ts';
import type { NodeCommit, NodeSnapshot, NodeDifference, NodePublicationRule } from './store.ts';
import type { NodeRecord } from './validation.ts';
import { frozen, compare, canonical } from './json.ts';
import { loadingTurns } from './loading.ts';

export class NodeConflict extends Error {}
/** Definitive pre-publication rejection, including integrity and live owner rules. */
export class NodePublicationRejected extends Error {}

// Private acceptance indexes. Loading extends these once per envelope; it never projects
// every earlier snapshot. Feature payload interpretation remains with the owning module.
function acceptanceState(records: readonly NodeRecord[] = []) {
  const selected = new Map<string, NodeVersion>();
  const transactions = new Map<string, NodeRecord>();
  const versions = new Map<string, { sequence: number; version: NodeVersion }[]>();
  const parents = new Map<string, Set<string>>();
  const roots = new Set<string>();
  let sequence = 0;
  const append = (record: NodeRecord) => {
    transactions.set(record.transaction.id, record);
    ({ sequence } = record.transaction);
    for (const version of record.versions) {
      selected.set(version.key.node, version);
      const history = versions.get(version.key.node) ?? [];
      history.push({ sequence, version });
      versions.set(version.key.node, history);
      if (version.placement) {
        const candidates = parents.get(version.placement.parent) ?? new Set<string>();
        candidates.add(version.key.node);
        parents.set(version.placement.parent, candidates);
      } else roots.add(version.key.node);
    }
  };
  for (const record of records) append(record);
  const get = (node: string, cutoff: number): NodeVersion | undefined => {
    if (cutoff === sequence) return selected.get(node);
    const history = versions.get(node);
    if (!history) return;
    let start = 0;
    let end = history.length;
    while (start < end) {
      const middle = (start + end) >>> 1;
      if (history[middle].sequence <= cutoff) start = middle + 1;
      else end = middle;
    }
    return history[start - 1]?.version;
  };
  const resolve = (address: NodeAddress, cutoff: number) => {
    if (address.transaction === undefined) return get(address.node, cutoff);
    const exactSequence = transactions.get(address.transaction)?.transaction.sequence;
    if (exactSequence === undefined || exactSequence > cutoff) return;
    const version = get(address.node, exactSequence);
    return version?.key.transaction === address.transaction ? version : undefined;
  };
  return {
    selected,
    transactions,
    parents,
    roots,
    get,
    resolve,
    append,
    versions: (node: string) =>
      Object.freeze(versions.get(node)?.map(({ version }) => version) ?? []),
    sequence: () => sequence,
  };
}

// Only immutable accepted arrays are retained. CLI callers may still build mutable histories.
const indexes = new WeakMap<readonly NodeRecord[], ReturnType<typeof acceptanceState>>();
function indexedRecords(records: readonly NodeRecord[]) {
  let index = indexes.get(records);
  if (!index) {
    index = acceptanceState(records);
    if (Object.isFrozen(records)) indexes.set(records, index);
  }
  return index;
}

export function snapshotOf(records: readonly NodeRecord[], cutoff?: number): NodeSnapshot {
  const sequence = cutoff ?? records.at(-1)?.transaction.sequence ?? 0;
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    sequence > (records.at(-1)?.transaction.sequence ?? 0)
  )
    throw new Error('Snapshot is outside recorded history');
  const index = indexedRecords(records);
  const get = (node: string) => index.get(node, sequence);
  const resolve = (address: NodeAddress) => index.resolve(address, sequence);
  return projection(
    sequence,
    get,
    resolve,
    index.roots,
    (parent) => index.parents.get(parent) ?? [],
  );
}

function projection(
  sequence: number,
  get: NodeSnapshot['get'],
  resolve: NodeSnapshot['resolve'],
  rootIds: Iterable<string>,
  childIds: (parent: string) => Iterable<string>,
): NodeSnapshot {
  const children = new Map<string, readonly NodeVersion[]>();
  const empty: readonly NodeVersion[] = Object.freeze([]);
  let roots: readonly NodeVersion[] | undefined;
  return Object.freeze({
    sequence,
    get,
    resolve,
    roots: () => {
      roots ??= Object.freeze(
        [...rootIds]
          .flatMap((node) => {
            const version = get(node);
            return version?.data && !version.placement ? [version] : [];
          })
          .sort((a, b) => compare(a.key.node, b.key.node)),
      );
      return roots;
    },
    children: (parent: string | NodeAddress) => {
      const address = typeof parent === 'string' ? { node: parent } : parent;
      if (resolve(address)?.data == null) return empty;
      let siblings = children.get(address.node);
      if (!siblings) {
        siblings = Object.freeze(
          [...childIds(address.node)]
            .flatMap((node) => {
              const version = get(node);
              return version?.data && version.placement?.parent === address.node ? [version] : [];
            })
            .sort(
              (a, b) =>
                compare(a.placement!.order, b.placement!.order) || compare(a.key.node, b.key.node),
            ),
        );
        children.set(address.node, siblings);
      }
      return siblings;
    },
  });
}

export function accept(
  records: readonly NodeRecord[],
  request: NodeCommit,
  requestDigest: string,
  recordedAt: string,
  publication?: NodePublicationRule,
): NodeRecord {
  try {
    return acceptIndexed(indexedRecords(records), request, requestDigest, recordedAt, publication);
  } catch (error) {
    if (error instanceof NodeConflict || error instanceof NodePublicationRejected) throw error;
    throw new NodePublicationRejected(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
}

function acceptIndexed(
  state: ReturnType<typeof acceptanceState>,
  request: NodeCommit,
  requestDigest: string,
  recordedAt: string,
  publication?: NodePublicationRule,
): NodeRecord {
  const prior = state.transactions.get(request.id);
  if (prior) {
    if (prior.requestDigest !== requestDigest)
      throw new Error('Transaction ID reused with different contents');
    return prior;
  }
  const changed = new Map<string, NodeVersion>();
  const get = (node: string) => changed.get(node) ?? state.selected.get(node);
  const expect = (node: string, transaction: string | null) => {
    if ((state.selected.get(node)?.key.transaction ?? null) !== transaction)
      throw new NodeConflict(`Conflict: ${node} changed since ${transaction ?? 'creation'}`);
  };
  for (const [node, transaction] of Object.entries(request.expectedReads ?? {}))
    expect(node, transaction);
  const versions = request.changes.map((change): NodeVersion => {
    if (changed.has(change.node)) throw new Error('Duplicate node identity');
    expect(change.node, change.expected);
    if (change.data === null && !state.selected.has(change.node))
      throw new Error('Cannot delete a new identity');
    const version = {
      key: { node: change.node, transaction: request.id },
      placement: change.placement,
      connection: change.connection,
      data: change.data,
    };
    changed.set(change.node, version);
    return version;
  });
  for (const version of versions) {
    if (version.placement && !get(version.placement.parent))
      throw new Error(`Unknown parent identity: ${version.placement.parent}`);
    if (version.connection)
      for (const endpoint of [version.connection.source, version.connection.target]) {
        if (!get(endpoint.node)) throw new Error(`Unknown node identity: ${endpoint.node}`);
        if (
          endpoint.transaction !== undefined &&
          !(endpoint.transaction === request.id && changed.has(endpoint.node)) &&
          !state.resolve(endpoint, state.sequence())
        )
          throw new Error(`Unknown exact version: ${endpoint.node} in ${endpoint.transaction}`);
      }
  }
  if (!get(request.recordedBy)) throw new Error('Unknown transaction author');
  if (request.origin !== null && !get(request.origin)) throw new Error('Unknown originating node');
  if (request.undoOf !== null && !state.transactions.has(request.undoOf))
    throw new Error('Unknown undo transaction');
  // Only containment is acyclic. Target references may form ordinary graph cycles.
  const checked = new Set<string>();
  // The accepted prefix is acyclic: every new cycle must pass through a changed node.
  for (const version of versions) {
    const path = new Set<string>();
    let cursor: NodeVersion | undefined = version;
    while (cursor && cursor.data !== null && !checked.has(cursor.key.node)) {
      if (path.has(cursor.key.node)) throw new Error('Containment cycle');
      path.add(cursor.key.node);
      cursor = cursor.placement === null ? undefined : get(cursor.placement.parent);
    }
    for (const id of path) checked.add(id);
  }
  const record: NodeRecord = frozen(
    structuredClone({
      transaction: {
        id: request.id,
        sequence: state.sequence() + 1,
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
  if (publication) {
    const sequence = state.sequence();
    // Policy reads immutable proposed values; it cannot change the request digest or accepted record.
    const proposed = new Map(record.versions.map((version) => [version.key.node, version]));
    const beforeGet = (node: string) => state.get(node, sequence);
    const beforeResolve = (address: NodeAddress) => state.resolve(address, sequence);
    const afterGet = (node: string) => proposed.get(node) ?? beforeGet(node);
    const afterResolve = (address: NodeAddress) =>
      address.transaction === undefined
        ? afterGet(address.node)
        : address.transaction === request.id
          ? proposed.get(address.node)
          : beforeResolve(address);
    const result: unknown = publication(
      Object.freeze({
        request: frozen(structuredClone(request)),
        before: projection(
          sequence,
          beforeGet,
          beforeResolve,
          state.roots,
          (parent) => state.parents.get(parent) ?? [],
        ),
        after: projection(
          sequence + 1,
          afterGet,
          afterResolve,
          (function* () {
            yield* state.roots;
            for (const version of record.versions)
              if (!(version.placement || state.roots.has(version.key.node))) yield version.key.node;
          })(),
          (parent) =>
            new Set([
              ...(state.parents.get(parent) ?? []),
              ...record.versions.flatMap((version) =>
                version.placement?.parent === parent ? [version.key.node] : [],
              ),
            ]),
        ),
        versions: state.versions,
      }),
    );
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      'then' in result &&
      typeof result.then === 'function'
    ) {
      // A mistaken async rule must not grant publication or leave an unhandled rejection.
      Promise.resolve(result).catch(() => undefined);
      throw new NodePublicationRejected('Live publication rules must run synchronously');
    }
  }
  return record;
}

/** Validate imported history before it becomes visible; append-only prefixes cannot be rewritten. */
export function validateRecords(
  values: readonly NodeRecord[],
  previous: readonly NodeRecord[] = [],
): readonly NodeRecord[] {
  const work = validateHistory(values, previous);
  let result = work.next();
  while (!result.done) result = work.next();
  return result.value;
}

/** Browser ingress uses the same validation, yielding between unpublished envelopes. */
export async function validateRecordsAsync(
  values: readonly NodeRecord[],
  previous: readonly NodeRecord[] = [],
): Promise<readonly NodeRecord[]> {
  const turn = loadingTurns();
  const work = validateHistory(values, previous);
  let result = work.next();
  while (!result.done) {
    const pause = turn();
    // biome-ignore lint/performance/noAwaitInLoops: an event-loop turn permits input and paint during loading.
    if (pause !== undefined) await pause;
    result = work.next();
  }
  return result.value;
}

function* validateHistory(
  values: readonly NodeRecord[],
  previous: readonly NodeRecord[],
): Generator<void, readonly NodeRecord[]> {
  if (values.length < previous.length) throw new Error('Recorded history was removed');
  const checked: NodeRecord[] = [];
  const state = acceptanceState(previous);
  for (const record of values) {
    const sequence = checked.length + 1;
    if (record.transaction.sequence !== sequence) throw new Error('Noncontiguous node history');
    const prior = previous[sequence - 1];
    if (prior) {
      if (prior !== record && canonical(prior) !== canonical(record))
        throw new Error('Recorded transaction was rewritten');
      checked.push(prior);
      yield;
      continue;
    }
    const { sequence: _sequence, recordedAt, ...transaction } = record.transaction;
    const request: NodeCommit = {
      ...transaction,
      changes: record.versions.map(({ key, ...version }) => {
        if (key.transaction !== transaction.id)
          throw new Error('Version belongs to another transaction');
        return {
          ...version,
          node: key.node,
          expected: state.selected.get(key.node)?.key.transaction ?? null,
        };
      }),
    };
    const accepted = acceptIndexed(state, request, record.requestDigest, recordedAt);
    if (accepted.transaction.sequence !== sequence)
      throw new Error('Duplicate transaction identity');
    checked.push(accepted);
    state.append(accepted);
    yield;
  }
  const records = Object.freeze(checked);
  indexes.set(records, state);
  return records;
}

export function differences(
  records: readonly NodeRecord[],
  transaction: string,
): readonly NodeDifference[] {
  const index = indexedRecords(records);
  const record = index.transactions.get(transaction);
  if (!record) throw new Error('Unknown transaction');
  return Object.freeze(
    record.versions.map((after) =>
      Object.freeze({
        node: after.key.node,
        before: index.get(after.key.node, record.transaction.sequence - 1) ?? null,
        after,
      }),
    ),
  );
}

// Shared application reads and lifecycle; physical persistence stays behind this internal seam.
import type { NodeBackend, NodeCommit } from './store.ts';
import type { NodeRecord } from './validation.ts';
import { snapshotOf, differences } from './history.ts';
import { frozen } from './json.ts';
import { sameOperation } from './operations.ts';

export function nodeInterface(options: {
  read: () => readonly NodeRecord[];
  append: (request: NodeCommit) => Promise<NodeRecord>;
  cached: () => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
  close: () => void;
  subscribe: (listener: () => void) => () => void;
}): NodeBackend {
  let closed = false;
  const ready = () => {
    if (closed) throw new Error('Node store is closed');
  };
  const snapshots = new Map<number, ReturnType<typeof snapshotOf>>();
  let lastRecords: readonly NodeRecord[] | undefined;
  return {
    commit: async (request) => {
      ready();
      const copy = frozen(structuredClone(request));
      return (await options.append(copy)).transaction;
    },
    snapshot: (sequence) => {
      ready();
      const records = options.read();
      if (records !== lastRecords) {
        snapshots.clear();
        lastRecords = records;
      }
      const cutoff = sequence ?? records.at(-1)?.transaction.sequence ?? 0;
      let snapshot = snapshots.get(cutoff);
      if (!snapshot) {
        snapshot = snapshotOf(records, cutoff);
        // Bound historical projection retention; records themselves remain immutable.
        if (snapshots.size >= 8) snapshots.delete(snapshots.keys().next().value!);
        snapshots.set(cutoff, snapshot);
      }
      return Promise.resolve(snapshot);
    },
    history: (query = {}) => {
      ready();
      if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0))
        throw new Error('History limit must be a nonnegative integer');
      return Promise.resolve(
        Object.freeze(
          options
            .read()
            .map((record) => record.transaction)
            .filter(
              (transaction) =>
                transaction.sequence < (query.beforeSequence ?? Number.POSITIVE_INFINITY) &&
                (!query.kinds || query.kinds.some((kind) => sameOperation(kind, transaction.kind))),
            )
            .reverse()
            .slice(0, query.limit ?? 50),
        ),
      );
    },
    changes: (transaction) => {
      ready();
      return Promise.resolve(differences(options.read(), transaction));
    },
    subscribe: (listener) => {
      ready();
      return options.subscribe(listener);
    },
    cached: () => {
      ready();
      return options.cached();
    },
    refresh: () => {
      ready();
      return options.refresh();
    },
    clear: () => {
      ready();
      return options.clear();
    },
    close: () => {
      if (!closed) {
        closed = true;
        snapshots.clear();
        options.close();
      }
    },
  };
}

export function notifications() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify: () => {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* A broken observer cannot invalidate a committed transaction. */
        }
      }
    },
    close: () => {
      listeners.clear();
    },
  };
}

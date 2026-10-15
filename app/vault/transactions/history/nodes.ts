// Core History reads and guarded compensation over the Transaction lifetime.
import type { NodeVersion, Transaction } from '../../nodes/model.ts';
import type { NodeCommit, NodeDifference, NodeReading } from '../../nodes/store.ts';
import { frozen } from '../../nodes/json.ts';
import type { TransactionStore, TransactionRequest } from '../store.ts';
import { transactionOperations } from '../../nodes/operations.ts';

export interface NodeHistoryEntry {
  readonly transaction: Transaction;
  /** Attribution is resolved at this transaction's cutoff, including historical actor names. */
  readonly author: NodeVersion;
  readonly origin: NodeVersion | null;
  readonly differences: readonly NodeDifference[];
}

export async function nodeHistory(
  store: NodeReading,
  options: Parameters<NodeReading['history']>[0] = {},
): Promise<readonly NodeHistoryEntry[]> {
  const viewing = await store.snapshot();
  const transactions = await store.history({
    ...options,
    beforeSequence: Math.min(options.beforeSequence ?? viewing.sequence + 1, viewing.sequence + 1),
  });
  return Object.freeze(
    await Promise.all(
      transactions.map(async (transaction) => {
        const snapshot = await store.snapshot(transaction.sequence);
        return Object.freeze({
          transaction,
          author: snapshot.get(transaction.recordedBy)!,
          origin: transaction.origin === null ? null : snapshot.get(transaction.origin)!,
          differences: await store.changes(transaction.id),
        });
      }),
    ),
  );
}

/** Prepare once; acceptance rejects any intervening version of an affected content node. */
export async function prepareContentUndo(
  store: NodeReading,
  options: {
    readonly transaction: string;
    readonly recordedBy: string;
    readonly id: string;
    /** Application supplies feature policies; History does not import or interpret another workflow. */
    readonly canUndo: (difference: NodeDifference) => boolean;
  },
): Promise<NodeCommit> {
  const differences = await store.changes(options.transaction);
  if (!differences.length) throw new Error('Transaction has no content changes');
  if (!differences.every(options.canUndo))
    throw new Error('Transaction contains changes that cannot be undone');
  return frozen({
    id: options.id,
    recordedBy: options.recordedBy,
    origin: null,
    undoOf: options.transaction,
    kind: transactionOperations.undo,
    message: `Undo ${options.transaction}`,
    changes: differences.map(({ node, before, after }) => ({
      node,
      expected: after.key.transaction,
      placement: before?.placement ?? null,
      connection: before?.connection ?? null,
      data: before?.data ?? null,
    })),
  });
}

/** Core owns retained compensation; Application supplies permission for its content owners. */
export function transactionHistory(
  nodes: TransactionStore,
  options: {
    readonly recordedBy: string;
    readonly canUndo: (difference: NodeDifference) => boolean;
  },
) {
  const retained = new Map<string, TransactionRequest<void>>();
  const active = new Map<string, Promise<Transaction>>();
  const attempt = async (transaction: string): Promise<Transaction> => {
    using writes = nodes.writer({ recordedBy: options.recordedBy, origin: null }).lifetime();
    let request = retained.get(transaction);
    const retrying = !!request;
    request ??= writes.write(async ({ id, nodes: reading }) => ({
      value: undefined,
      transaction: await prepareContentUndo(reading, { id, transaction, ...options }),
    }));
    retained.set(transaction, request);
    try {
      const receipt = await (retrying ? writes.retry(request) : request.result);
      return receipt.transaction;
    } finally {
      if (['accepted', 'rejected'].includes(request.snapshot().phase)) retained.delete(transaction);
    }
  };
  const undo = (transaction: string) => {
    const current = active.get(transaction);
    if (current !== undefined) return current;
    const work = attempt(transaction);
    active.set(transaction, work);
    void work.then(
      () => active.delete(transaction),
      () => active.delete(transaction),
    );
    return work;
  };
  return {
    entries: (query?: Parameters<NodeReading['history']>[0]) => nodeHistory(nodes, query),
    subscribe: nodes.subscribe,
    canUndo: (entry: NodeHistoryEntry) =>
      entry.differences.length > 0 && entry.differences.every(options.canUndo),
    undo: (entry: NodeHistoryEntry) => undo(entry.transaction.id),
    compensate: undo,
  };
}

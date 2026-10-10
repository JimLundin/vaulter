// Feature-facing History reads and content compensation over the shared NodeStore.
import type { NodeVersion, Transaction } from '../../vault/nodes/model.ts';
import type { NodeCommit, NodeDifference, NodeStore } from '../../vault/nodes/store.ts';
import { frozen } from '../../vault/nodes/json.ts';
import { transactionOperations } from '../../vault/nodes/operations.ts';

export interface NodeHistoryEntry {
  readonly transaction: Transaction;
  /** Attribution is resolved at this transaction's cutoff, including historical actor names. */
  readonly author: NodeVersion;
  readonly origin: NodeVersion | null;
  readonly differences: readonly NodeDifference[];
}

export async function nodeHistory(
  store: NodeStore,
  options: Parameters<NodeStore['history']>[0] = {},
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
  store: NodeStore,
  options: {
    readonly transaction: string;
    readonly recordedBy: string;
    readonly id: string;
    /** Product supplies feature policies; History does not import or interpret another workflow. */
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

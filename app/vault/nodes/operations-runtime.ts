import type { NodeStore } from './store.ts';
import type { NodeAddress, NodeVersion, Transaction } from './model.ts';
import { transactionOperations } from './operations.ts';

/** Reachability in a selected snapshot; exact targets preserve individual versions, not subtrees. */
export async function nodeClosure(
  store: NodeStore,
  root: NodeAddress,
  sequence?: number,
): Promise<readonly NodeVersion[]> {
  const snapshot = await store.snapshot(sequence);
  const visited = new Set<string>();
  const result: NodeVersion[] = [];
  const pending = [root];
  while (pending.length) {
    const address = pending.pop()!;
    const version = snapshot.resolve(address);
    if (!version || version.data === null) continue;
    const key = JSON.stringify([version.key.node, version.key.transaction]);
    if (visited.has(key)) continue;
    visited.add(key);
    result.push(version);
    pending.push(...snapshot.children(version.key.node).map((child) => ({ node: child.key.node })));
    if (version.connection) pending.push(version.connection.target);
  }
  return Object.freeze(result);
}

/** Append guarded compensation; identities, original transactions, and exact citations remain. */
export async function undoNodes(
  store: NodeStore,
  transaction: string,
  recordedBy: string,
): Promise<Transaction> {
  const differences = await store.changes(transaction);
  return store.commit({
    id: crypto.randomUUID(),
    recordedBy,
    origin: null,
    undoOf: transaction,
    kind: transactionOperations.undo,
    message: `Undo ${transaction}`,
    changes: differences.map(({ node, before, after }) => ({
      node,
      expected: after.key.transaction,
      placement: before?.placement ?? null,
      connection: before?.connection ?? null,
      data: before?.data ?? null,
    })),
  });
}

import type { NodeReading } from './store.ts';
import type { NodeAddress, NodeVersion } from './model.ts';

/** Reachability in a selected snapshot; exact targets preserve individual versions, not subtrees. */
export async function nodeClosure(
  store: NodeReading,
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
    pending.push(...snapshot.children(version.key).map((child) => ({ node: child.key.node })));
    if (version.connection) pending.push(version.connection.target);
  }
  return Object.freeze(result);
}

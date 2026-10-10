// Fictional fixtures shared by adapter acceptance tests.
import type { NodeChange, NodeCommit, NodeStore } from './store.ts';
import { nodeOperations } from './operations.ts';

export const create = (node: string, data: NodeChange['data'], parent?: string): NodeChange => ({
  node,
  expected: null,
  data,
  placement: parent ? { parent, order: 'a' } : null,
  connection: null,
});
export const request = (id: string, changes: readonly NodeChange[]): NodeCommit => ({
  id,
  changes,
  recordedBy: 'user',
  origin: null,
  undoOf: null,
  kind: nodeOperations.update,
  message: id,
});
export const seed = (store: NodeStore) =>
  store.commit(
    request('seed', [
      create('user', { kind: 'actor', name: 'Fictional user' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('evidence', { kind: 'paragraph', text: 'Keep mornings free.' }),
      {
        ...create('appearance', { kind: 'appearance' }, 'page'),
        connection: { source: { node: 'page' }, target: { node: 'evidence' } },
      },
    ]),
  );
export async function revise(
  store: NodeStore,
  node: string,
  data: NodeChange['data'],
): Promise<NodeChange> {
  const version = (await store.snapshot()).get(node)!;
  return {
    node,
    expected: version.key.transaction,
    placement: version.placement,
    connection: version.connection,
    data,
  };
}

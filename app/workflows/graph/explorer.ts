import type { NodeReading, NodeSnapshot } from '../../vault/nodes/store.ts';
import type { NodeVersion } from '../../vault/nodes/model.ts';
import type { SourceDescription } from '../../vault/sources.ts';
import { readGraph, type Graph } from './reading.ts';

export interface GraphSubject {
  readonly id: string;
  readonly address: NodeVersion['key'];
  readonly title: string;
  readonly href?: string;
  readonly connections: number;
  readonly state: 'available' | 'deleted';
}
export interface GraphExplorerState {
  readonly graph: Graph | null;
  readonly view?: NodeSnapshot;
  readonly subjects: readonly GraphSubject[];
  readonly loading: boolean;
  readonly error?: string;
}
export type GraphDescription = (
  node: NodeVersion,
  view: NodeSnapshot,
) => SourceDescription | undefined;

/** Project only relationship endpoints and Terms; foreign record descriptions are supplied by owners. */
export function projectGraphExplorer(
  view: NodeSnapshot,
  describe: GraphDescription,
): GraphExplorerState {
  const graph = readGraph(view);
  const subjects = new Map<string, GraphSubject>();
  const add = (node: NodeVersion) => {
    if (subjects.has(node.key.node)) return;
    const term = node.data?.kind === 'term';
    const description = describe(node, view);
    const title = term
      ? String(node.data?.label ?? node.data?.key ?? 'Unnamed term')
      : description?.title || 'Untitled subject';
    subjects.set(node.key.node, {
      id: node.key.node,
      address: node.key,
      title,
      href: description?.href,
      state: node.data ? 'available' : 'deleted',
      connections: graph.relationships({ node: node.key.node }).length,
    });
  };
  const pending = [...view.roots()];
  while (pending.length) {
    const node = pending.pop()!;
    pending.push(...view.children(node.key.node));
    if (node.data?.kind === 'term') add(node);
    if (node.data?.kind !== 'relationship') continue;
    const source =
      node.connection?.source ?? (node.placement ? { node: node.placement.parent } : undefined);
    for (const address of [source, node.connection?.target]) {
      if (!address) continue;
      const selected = view.get(address.node) ?? view.resolve(address);
      if (selected) add(selected);
    }
  }
  return {
    graph,
    view,
    subjects: [...subjects.values()].sort(
      (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
    ),
    loading: false,
  };
}

/** Own subscribed reads, generation ordering, retained results and disposal. */
export function createGraphExplorer(nodes: NodeReading | null, describe: GraphDescription) {
  let state: GraphExplorerState = { graph: null, subjects: [], loading: !!nodes };
  let generation = 0;
  let disposed = false;
  let started = false;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: GraphExplorerState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const reload = async () => {
    if (disposed || !nodes) return;
    const request = ++generation;
    publish({ ...state, loading: true });
    try {
      const view = await nodes.snapshot();
      const next = projectGraphExplorer(view, describe);
      if (!disposed && request === generation) publish(next);
    } catch (error) {
      if (!disposed && request === generation)
        publish({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };
  return {
    start: () => {
      if (started || disposed) return;
      started = true;
      unsubscribe = nodes?.subscribe(() => void reload());
      void reload();
    },
    reload,
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribe?.();
      listeners.clear();
    },
  };
}
export type GraphExplorer = ReturnType<typeof createGraphExplorer>;

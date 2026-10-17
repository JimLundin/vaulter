import type { GraphDatabase, GraphEndpoint } from './reading.ts';
import { readGraph, type Graph } from './reading.ts';

export interface GraphSubject {
  readonly id: string;
  readonly title: string;
  readonly href?: string;
  readonly connections: number;
  readonly state: 'available' | 'deleted';
}
export interface GraphExplorerState {
  readonly graph: Graph | null;
  readonly subjects: readonly GraphSubject[];
  readonly loading: boolean;
  readonly error?: string;
}
export type GraphDescription = (
  endpoint: GraphEndpoint,
) => { title: string; href?: string } | undefined;
export interface EavGraphInput {
  readonly database: () => Promise<GraphDatabase>;
  readonly describe?: GraphDescription;
}
export async function projectGraphExplorer(
  db: GraphDatabase,
  describe?: GraphDescription,
): Promise<GraphExplorerState> {
  const graph = await readGraph(db);
  const subjects = new Map<string, GraphSubject>();
  for (const endpoint of graph.endpoints) {
    if (!endpoint.address || subjects.has(endpoint.address.entity)) continue;
    const values = endpoint.current ?? endpoint.values;
    const description = describe?.(endpoint);
    subjects.set(endpoint.address.entity, {
      id: endpoint.address.entity,
      title:
        description?.title ??
        String(values?.title ?? values?.label ?? values?.key ?? 'Untitled subject'),
      href: description?.href,
      state: !endpoint.current || endpoint.current.available === false ? 'deleted' : 'available',
      connections: graph.relationships(endpoint.address).length,
    });
  }
  return {
    graph,
    subjects: [...subjects.values()].sort(
      (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
    ),
    loading: false,
  };
}

/** Own subscribed reads, generation ordering, retained results and disposal. */
export function createGraphExplorer(input: EavGraphInput | null) {
  let state: GraphExplorerState = { graph: null, subjects: [], loading: !!input };
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
    if (disposed || !input) return;
    const request = ++generation;
    publish({ ...state, loading: true });
    try {
      const db = await input.database();
      if (disposed || request !== generation) return;
      unsubscribe ??= db.subscribe(() => void reload());
      const next = await projectGraphExplorer(db, input.describe);
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

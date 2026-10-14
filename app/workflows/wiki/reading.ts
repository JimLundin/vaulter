import type { NodeReading } from '../../vault/nodes/store.ts';
import type { SourceReader } from '../../vault/sources.ts';
import { readWiki, type WikiPage } from './pages.ts';

export interface WikiReadingState {
  readonly pages: WikiPage[] | null;
  readonly loading: boolean;
  readonly error?: string;
}

export interface WikiReading {
  readonly start: () => void;
  readonly reload: () => Promise<void>;
  readonly snapshot: () => WikiReadingState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly closed: () => boolean;
  readonly dispose: () => void;
}

/** Own the subscribed collection without owning the supplied store or source readers. */
export function createWikiReading(nodes: NodeReading | null, sources: SourceReader): WikiReading {
  let state: WikiReadingState = { pages: null, loading: !!nodes };
  let generation = 0;
  let disposed = false;
  let started = false;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: WikiReadingState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const reload = async () => {
    if (disposed || !nodes) return;
    const request = ++generation;
    publish({ ...state, loading: true });
    try {
      const pages = await readWiki(nodes, sources);
      if (!disposed && request === generation) publish({ pages, loading: false });
    } catch (error) {
      if (!disposed && request === generation)
        publish({
          pages: state.pages,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };
  return {
    start: () => {
      if (disposed || started) return;
      started = true;
      if (nodes) unsubscribe = nodes.subscribe(() => void reload());
      void reload();
    },
    reload,
    snapshot: () => state,
    subscribe: (listener) => {
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

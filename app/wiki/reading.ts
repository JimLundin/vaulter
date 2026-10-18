import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { readEavWiki } from './pages.ts';
import type { WikiDatabase, SourceReading } from '@/wiki/reviews/selection.ts';
import type { WikiPage } from '@/wiki/view.ts';

export interface EavWikiInput {
  readonly database: () => Promise<WikiDatabase>;
  readonly sources?: SourceReading;
}
export function createEavWikiReading(input: EavWikiInput | null) {
  let state: { pages: WikiPage[] | null; loading: boolean; error?: string } = {
    pages: null,
    loading: !!input,
  };
  let disposed = false,
    started = false,
    generation = 0;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => {
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
      const pages = await readEavWiki(db, input.sources);
      if (!disposed && request === generation) publish({ pages, loading: false });
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
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      if (!(disposed || started)) {
        started = true;
        void reload();
      }
    },
    reload,
    closed: () => disposed,
    dispose: () => {
      disposed = true;
      generation++;
      unsubscribe?.();
      listeners.clear();
    },
  };
}
export function useEavWikiReading(input: EavWikiInput | null) {
  const [lifetime, setLifetime] = useState(() => ({ input, reading: createEavWikiReading(input) }));
  let current = lifetime;
  if (current.input !== input) {
    current = { input, reading: createEavWikiReading(input) };
    setLifetime(current);
  }
  const { reading } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect replay replaces only the disposed lifetime for this input.
  useLayoutEffect(() => {
    const owned = reading.closed() ? createEavWikiReading(input) : reading;
    if (owned !== reading) setLifetime({ input, reading: owned });
    owned.start();
    return () => owned.dispose();
  }, [input]);
  return { reading, ...useSyncExternalStore(reading.subscribe, reading.snapshot) };
}

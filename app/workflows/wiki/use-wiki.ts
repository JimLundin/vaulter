import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { NodeStore } from '../../vault/nodes/store.ts';
import type { SourceReader } from '../../vault/sources.ts';
import { createWikiReading, type WikiReading } from './reading.ts';

export const useWiki = (reading: WikiReading) =>
  useSyncExternalStore(reading.subscribe, reading.snapshot);

export function useWikiReading(nodes: NodeStore | null, sources: SourceReader): WikiReading {
  const [lifetime, setLifetime] = useState(() => ({
    nodes,
    sources,
    reading: createWikiReading(nodes, sources),
  }));
  let current = lifetime;
  if (lifetime.nodes !== nodes || lifetime.sources !== sources) {
    current = { nodes, sources, reading: createWikiReading(nodes, sources) };
    setLifetime(current);
  }
  const { reading } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the input scope owns the lifetime; effect replay replaces its disposed reader.
  useLayoutEffect(() => {
    const owned = reading.closed() ? createWikiReading(nodes, sources) : reading;
    if (owned !== reading) setLifetime({ nodes, sources, reading: owned });
    owned.start();
    return () => owned.dispose();
  }, [nodes, sources]);
  return reading;
}

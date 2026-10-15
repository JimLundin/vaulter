import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { NodeReading } from '../../vault/nodes/store.ts';
import type { SourceReader } from '../../vault/sources.ts';
import { createWikiReading, type WikiReading } from './reading.ts';
import type { WikiRelatedContentReading } from './related-content.ts';

export const useWiki = (reading: WikiReading) =>
  useSyncExternalStore(reading.subscribe, reading.snapshot);

export function useWikiReading(
  nodes: NodeReading | null,
  sources: SourceReader,
  relatedContent: WikiRelatedContentReading,
): WikiReading {
  const [lifetime, setLifetime] = useState(() => ({
    nodes,
    sources,
    relatedContent,
    reading: createWikiReading(nodes, sources, relatedContent),
  }));
  let current = lifetime;
  if (
    lifetime.nodes !== nodes ||
    lifetime.sources !== sources ||
    lifetime.relatedContent !== relatedContent
  ) {
    current = {
      nodes,
      sources,
      relatedContent,
      reading: createWikiReading(nodes, sources, relatedContent),
    };
    setLifetime(current);
  }
  const { reading } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the input scope owns the lifetime; effect replay replaces its disposed reader.
  useLayoutEffect(() => {
    const owned = reading.closed() ? createWikiReading(nodes, sources, relatedContent) : reading;
    if (owned !== reading) setLifetime({ nodes, sources, relatedContent, reading: owned });
    owned.start();
    return () => owned.dispose();
  }, [nodes, sources, relatedContent]);
  return reading;
}

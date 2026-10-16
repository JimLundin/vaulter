import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { NodeReading } from '../../vault/nodes/store.ts';
import { createGraphExplorer, type GraphDescription, type GraphExplorer } from './explorer.ts';

export const useGraph = (reading: GraphExplorer) =>
  useSyncExternalStore(reading.subscribe, reading.snapshot);

export function useGraphExplorer(
  nodes: NodeReading | null,
  describe: GraphDescription,
): GraphExplorer {
  const [lifetime, setLifetime] = useState(() => ({
    nodes,
    describe,
    reading: createGraphExplorer(nodes, describe),
  }));
  let current = lifetime;
  if (lifetime.nodes !== nodes || lifetime.describe !== describe) {
    current = { nodes, describe, reading: createGraphExplorer(nodes, describe) };
    setLifetime(current);
  }
  const { reading } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect replay replaces a disposed reader within the input lifetime.
  useLayoutEffect(() => {
    const owned = reading.closed() ? createGraphExplorer(nodes, describe) : reading;
    if (owned !== reading) setLifetime({ nodes, describe, reading: owned });
    owned.start();
    return () => owned.dispose();
  }, [nodes, describe]);
  return reading;
}

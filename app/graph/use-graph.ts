import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createGraphExplorer, type EavGraphInput, type GraphExplorer } from './explorer.ts';

export const useGraph = (reading: GraphExplorer) =>
  useSyncExternalStore(reading.subscribe, reading.snapshot);

export function useGraphExplorer(input: EavGraphInput | null): GraphExplorer {
  const [lifetime, setLifetime] = useState(() => ({
    input,
    reading: createGraphExplorer(input),
  }));
  let current = lifetime;
  if (lifetime.input !== input) {
    current = { input, reading: createGraphExplorer(input) };
    setLifetime(current);
  }
  const { reading } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect replay replaces a disposed reader within the input lifetime.
  useLayoutEffect(() => {
    const owned = reading.closed() ? createGraphExplorer(input) : reading;
    if (owned !== reading) setLifetime({ input, reading: owned });
    owned.start();
    return () => owned.dispose();
  }, [input]);
  return reading;
}

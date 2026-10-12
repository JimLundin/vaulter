import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { NodeStore } from '../../vault/nodes/store.ts';
import { createQuestionsReading, type QuestionsReading } from './reading.ts';

export const useQuestions = (reading: QuestionsReading) =>
  useSyncExternalStore(reading.subscribe, reading.snapshot);

export function useQuestionsReading(nodes: NodeStore | null): QuestionsReading {
  const [lifetime, setLifetime] = useState(() => ({
    nodes,
    reading: createQuestionsReading(nodes),
  }));
  let current = lifetime;
  if (lifetime.nodes !== nodes) {
    current = { nodes, reading: createQuestionsReading(nodes) };
    setLifetime(current);
  }
  const { reading } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the input scope owns the lifetime; effect replay replaces its disposed reader.
  useLayoutEffect(() => {
    const owned = reading.closed() ? createQuestionsReading(nodes) : reading;
    if (owned !== reading) setLifetime({ nodes, reading: owned });
    owned.start();
    return () => owned.dispose();
  }, [nodes]);
  return reading;
}

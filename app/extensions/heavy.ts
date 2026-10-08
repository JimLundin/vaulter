// The slow derivations (hundreds of ms each), as plain data so the worker can compute them off the main
// thread and the cache can keep them per tree. Like index.ts, the features' list: a feature adds its slow
// derivation here and reads it with useHeavy<T>(key) (app/core/host.tsx).
import type { VaultFile } from '../core/files.ts';
import { graphOf, type Graph } from './graph/model/graph.ts';
import { isTopical } from './notes/model/fields.ts';
import { layoutMap } from './map/vault-map.ts';
import { similarNotes } from './similar/similar.ts';

export const HEAVY = {
  map: (v: Graph) => layoutMap(v.notes.filter(isTopical), v.backlinks, v.schema),
  similar: (v: Graph) => similarNotes(v.notes.filter(isTopical), v.backlinks, v.graph),
};
export type HeavyKey = keyof typeof HEAVY;
export type Heavy = { [K in HeavyKey]: ReturnType<(typeof HEAVY)[K]> };

export const computeHeavy = (files: VaultFile[]) => {
  const v = graphOf(files);
  return Object.fromEntries(Object.entries(HEAVY).map(([k, f]) => [k, f(v)])) as Heavy;
};

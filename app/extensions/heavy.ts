// The slow derivations (hundreds of ms each), as plain data so the worker can compute them off the main
// thread and the cache can keep them per tree. A feature adds one here and reads it with useHeavy(key).
import { isTopical, type Vault } from './graph/model/graph.ts';
import { layoutMap } from './map/vault-map.ts';
import { similarNotes } from './similar/similar.ts';

export const HEAVY = {
  map: (v: Vault) => layoutMap(v.notes.filter(isTopical), v.backlinks, v.schema),
  similar: (v: Vault) => similarNotes(v.notes.filter(isTopical), v.backlinks, v.graph),
};
export type HeavyKey = keyof typeof HEAVY;
export type Heavy = { [K in HeavyKey]: ReturnType<(typeof HEAVY)[K]> };

export const computeHeavy = (v: Vault) =>
  Object.fromEntries(Object.entries(HEAVY).map(([k, f]) => [k, f(v)])) as Heavy;

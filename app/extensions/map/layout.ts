// The map's layout, once per graph (vault-map.ts): every topical note placed, by area.
import { perGraph } from '../graph/model/graph.ts';
import { isTopical } from '../notes/model/fields.ts';
import { layoutMap } from './vault-map.ts';

export const mapOf = perGraph((v) => layoutMap(v.notes.filter(isTopical), v.backlinks, v.schema));

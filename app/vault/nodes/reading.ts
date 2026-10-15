import type { NodeVersion } from './model.ts';
import type { NodeSnapshot } from './store.ts';

/** The live containment path from a Node to its root, independent of record meaning. */
export function liveAncestry(view: NodeSnapshot, node: string): readonly NodeVersion[] | undefined {
  const ancestry: NodeVersion[] = [];
  const seen = new Set<string>();
  let current = view.get(node);
  while (current) {
    if (!current.data || seen.has(current.key.node)) return;
    ancestry.push(current);
    seen.add(current.key.node);
    if (!current.placement) return ancestry;
    current = view.get(current.placement.parent);
  }
}

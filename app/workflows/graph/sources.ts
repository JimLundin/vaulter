import type { NodeVersion } from '@/vault/nodes/model.ts';
import type { SourceReader } from '@/vault/sources.ts';
import { graphSchemas } from './records.ts';

export const graphSources: SourceReader = {
  text(node, { view, textOf }) {
    if (!(node.data && Object.hasOwn(graphSchemas, String(node.data.kind)))) return;
    if (node.data.kind === 'relationship') return '';
    return view.children(node.key).map(textOf).filter(Boolean).join('\n');
  },
  describe(node, view) {
    if (!(node.data && Object.hasOwn(graphSchemas, String(node.data.kind)))) return;
    // Retain historical source description semantics while moving interpretation to its owner.
    let ancestor: NodeVersion | undefined = node;
    let title: string | undefined;
    const seen = new Set<string>();
    while (ancestor?.data && !seen.has(ancestor.key.node)) {
      seen.add(ancestor.key.node);
      if (title === undefined && typeof ancestor.data.title === 'string' && ancestor.data.title)
        ({ title } = ancestor.data);
      ancestor = ancestor.placement ? view.get(ancestor.placement.parent) : undefined;
    }
    return { title: title ?? '' };
  },
};

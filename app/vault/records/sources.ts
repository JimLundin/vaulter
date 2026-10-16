import type { NodeVersion } from '../nodes/model.ts';
import type { SourceReader } from '../sources.ts';

// Historical source kinds whose text remains available to application citation reading.
const ownedKinds = new Set([
  'relationship',
  'term',
  'query',
  'task',
  'decision',
  'date',
  'timeline',
  'resource',
  'actor',
  'agent',
]);

export const retainedRecordSources: SourceReader = {
  text(node, { view, textOf }) {
    const { data } = node;
    if (!data || typeof data.kind !== 'string' || !ownedKinds.has(data.kind)) return;
    if (data.kind === 'relationship') return '';
    return view.children(node.key).map(textOf).filter(Boolean).join('\n');
  },
  describe(node, view) {
    if (!node.data || typeof node.data.kind !== 'string' || !ownedKinds.has(node.data.kind)) return;
    let ancestor: NodeVersion | undefined = node;
    let title: string | undefined;
    const seen = new Set<string>();
    while (ancestor?.data && !seen.has(ancestor.key.node)) {
      seen.add(ancestor.key.node);
      const { data } = ancestor;
      if (title === undefined && typeof data.title === 'string' && data.title) ({ title } = data);
      ancestor = ancestor.placement ? view.get(ancestor.placement.parent) : undefined;
    }
    const url = node.data.kind === 'resource' ? node.data.url : undefined;
    return {
      title: title ?? (typeof url === 'string' ? url : ''),
      href: typeof url === 'string' ? url : undefined,
    };
  },
};

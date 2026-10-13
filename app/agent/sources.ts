import type { NodeVersion } from '../vault/nodes/model.ts';
import type { SourceReader } from '../vault/sources.ts';

const ownedKinds = new Set(['contextInput', 'agentRun', 'toolExecution']);

export const isAgentContext = (node: NodeVersion) => node.data?.kind === 'contextInput';

export const agentSources: SourceReader = {
  exactText(node) {
    if (!isAgentContext(node) || ['system', 'tool'].includes(String(node.data?.role))) return;
    if (typeof node.data?.content === 'string') return node.data.content;
  },
  text(node, { view, textOf }) {
    const { data } = node;
    if (!data || typeof data.kind !== 'string' || !ownedKinds.has(data.kind)) return;
    if (data.kind === 'contextInput' && typeof data.content === 'string') return data.content;
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
    return { title: title ?? '' };
  },
};

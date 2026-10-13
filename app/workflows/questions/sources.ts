import type { NodeVersion } from '../../vault/nodes/model.ts';
import type { SourceReader } from '../../vault/sources.ts';
import { parseAnswer, parseQuestion } from './records.ts';

/** Questions retains the text grammar used by existing historical selections. */
export const questionSources: SourceReader = {
  exactText(node) {
    if (node.data?.kind === 'answer') return parseAnswer(node.data).text;
    if (node.data?.kind === 'question') return parseQuestion(node.data).text;
  },
  text(node) {
    if (node.data?.kind === 'answer') return parseAnswer(node.data).text;
    if (node.data?.kind !== 'question') return;
    return parseQuestion(node.data).text;
  },
  describe(node, view) {
    if (node.data?.kind === 'answer') parseAnswer(node.data);
    else if (node.data?.kind === 'question') parseQuestion(node.data);
    else return;
    let ancestor: NodeVersion | undefined = node;
    const seen = new Set<string>();
    while (ancestor?.data && !seen.has(ancestor.key.node)) {
      seen.add(ancestor.key.node);
      if (typeof ancestor.data.title === 'string' && ancestor.data.title)
        return { title: ancestor.data.title };
      ancestor = ancestor.placement ? view.get(ancestor.placement.parent) : undefined;
    }
    return { title: '' };
  },
};

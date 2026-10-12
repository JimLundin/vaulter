import type { SourceReader } from '../sources.ts';

/** Content records remain independently owned source material, with no Wiki destination. */
export const contentSources: SourceReader = {
  text(node) {
    if (node.data?.kind !== 'content') return;
    return typeof node.data.text === 'string' ? node.data.text : '';
  },
  describe(node) {
    if (node.data?.kind !== 'content') return;
    return { title: typeof node.data.title === 'string' ? node.data.title : '' };
  },
};

import type { SourceReader } from '@/vault/sources.ts';

/** Content records remain independently owned source material, with no Wiki destination. */
export const contentSources: SourceReader = {
  exactText(node) {
    if (node.data?.kind !== 'content' || typeof node.data.text !== 'string') return;
    return node.data.text;
  },
  text(node) {
    if (node.data?.kind !== 'content') return;
    return typeof node.data.text === 'string' ? node.data.text : '';
  },
  describe(node) {
    if (node.data?.kind !== 'content') return;
    return { title: typeof node.data.title === 'string' ? node.data.title : '' };
  },
};

import type { Root, Nodes } from 'mdast';
import { siteHref, parseVaultLink } from './paths.ts';

/** Rewrites vault links ([x](</Note.md#h>)) to site URLs and marks them for hover previews. */
export function remarkVaultLinks() {
  return (tree: Root) => {
    const walk = (node: Nodes) => {
      if (node.type === 'link' && parseVaultLink(node.url)) {
        node.url = siteHref(node.url);
        node.data = node.data || {};
        node.data.hProperties = { ...(node.data.hProperties || {}), className: ['vault-link'] };
      }
      if ('children' in node) node.children.forEach(walk);
    };
    walk(tree);
  };
}

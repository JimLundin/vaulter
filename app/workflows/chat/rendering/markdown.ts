// A note's body -> React elements: GFM, smart quotes, vault links, heading ids. Raw HTML and unsafe URLs
// are dropped. Links become app routes (link() in route.ts), and in-page anchors stay on the note's route.
// A body that doesn't render shows as an error.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkRehype from 'remark-rehype';
import GithubSlugger from 'github-slugger';
import { toString as textOf } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { remarkVaultLinks } from '../../../vault/documents/notes/remark-vault-links.ts';
import { isSafeUrl } from '../../../vault/documents/notes/safe-url.ts';
import { hrefOf, type Note } from '../../../vault/documents/notes/fields.ts';
import { link } from '../../../ui/routing.ts';
import { Pre } from './highlight.tsx';

/** Every heading gets the GitHub-style id that vault links (#heading) point at. */
const rehypeHeadingIds = () => (tree: any) => {
  const slugger = new GithubSlugger();
  visit(tree, 'element', (node: any) => {
    if (/^h[1-6]$/.test(node.tagName)) node.properties.id ??= slugger.slug(textOf(node));
  });
};

/** Unsafe link and image URLs (javascript: and the like) are dropped. */
const rehypeSafeUrls = () => (tree: any) => {
  visit(tree, 'element', (node: any) => {
    for (const k of ['href', 'src'])
      if (k in node.properties && !isSafeUrl(node.properties[k])) delete node.properties[k];
  });
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSmartypants)
  .use(remarkVaultLinks)
  .use(remarkRehype)
  .use(rehypeHeadingIds)
  .use(rehypeSafeUrls)
  .freeze();

/** "/janne/#h" -> "#/janne/#h"; "#fn-1" -> "#/this-note/#fn-1". */
const appLinks = (tree: any, route: string) =>
  visit(tree, 'element', (node: any) => {
    const h = node.properties.href;
    if (typeof h !== 'string') return;
    if (h.startsWith('/') && !h.startsWith('//')) node.properties.href = link(h);
    else if (h.startsWith('#')) node.properties.href = link(route + h);
  });

/** The rendered body. */
export function renderBody(note: Pick<Note, 'id' | 'path' | 'body'>): ReactNode {
  try {
    const hast = processor.runSync(processor.parse(note.body));
    appLinks(hast, hrefOf(note));
    return toJsxRuntime(hast as any, {
      Fragment,
      jsx: jsx as any,
      jsxs: jsxs as any,
      components: { pre: Pre } as any,
      elementAttributeNameCase: 'react',
      stylePropertyNameCase: 'dom',
    });
  } catch (e) {
    return jsx('p', {
      className: 'render-error',
      children: `${note.path} doesn't render: ${(e as Error).message}`,
    });
  }
}

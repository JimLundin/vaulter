// A note's body -> React elements: GFM, smart quotes, vault links, heading ids. In .mdx, the components
// allowed by mdx-rules.ts, with literal props resolved without eval. Raw HTML and unsafe URLs are
// dropped. Links become app routes (link() in route.ts), and in-page anchors stay on the note's route.
// A body that breaks the rules renders as an error, never as code.
import { unified, type Plugin, type Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import type {} from 'mdast-util-mdx'; // registers the MDX node types used in passThrough
import remarkRehype from 'remark-rehype';
import GithubSlugger from 'github-slugger';
import { toString as textOf } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import type { ComponentType, ReactNode } from 'react';
import { remarkVaultLinks } from '../notes/model/remark-vault-links.ts';
import { literal, isComment } from '../notes/model/mdx-literal.ts';
import { remove } from 'unist-util-remove';
import { isSafeUrl } from '../notes/model/safe-url.ts';
import { hrefOf, type Note } from '../notes/model/fields.ts';
import { link } from '../../core/route.ts';
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

// The MDX parser (acorn) is large and only .mdx notes need it, so it loads with the first one (loadMdx).
const build = (mdx?: Plugin): Processor<any, any, any, any, any> =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    .use(mdx ? [mdx] : [])
    .use(remarkVaultLinks)
    .use(() => (tree: any) => {
      remove(tree, isComment);
    })
    // MDX nodes go through to the JSX step, which resolves them with the literal-only evaluater below.
    .use(remarkRehype, {
      passThrough: [
        'mdxJsxFlowElement',
        'mdxJsxTextElement',
        'mdxFlowExpression',
        'mdxTextExpression',
        'mdxjsEsm',
      ],
    })
    .use(rehypeHeadingIds)
    .use(rehypeSafeUrls)
    .freeze();
const processors: {
  md: Processor<any, any, any, any, any>;
  mdx?: Processor<any, any, any, any, any>;
} = { md: build() };
let mdxLoading: Promise<void> | undefined;

/** True once .mdx notes can render; until then renderBody returns null for them. */
export const mdxReady = () => !!processors.mdx;
export const loadMdx = () => {
  mdxLoading ??= import('remark-mdx').then((m) => {
    processors.mdx = build(m.default);
  });
  return mdxLoading;
};

/** "/janne/#h" -> "#/janne/#h"; "#fn-1" -> "#/this-note/#fn-1". */
const appLinks = (tree: any, route: string) =>
  visit(tree, 'element', (node: any) => {
    const h = node.properties.href;
    if (typeof h !== 'string') return;
    if (h.startsWith('/') && !h.startsWith('//')) node.properties.href = link(h);
    else if (h.startsWith('#')) node.properties.href = link(route + h);
  });

const evaluater = (components: Record<string, unknown>) => () => ({
  evaluateExpression: (e: any) => literal(e, components),
  evaluateProgram: () => {
    throw new Error('import/export is not allowed in a note');
  },
});

/** The rendered body; `components` are the MDX components the extensions provide (the host's mdx). */
export function renderBody(
  note: Pick<Note, 'id' | 'path' | 'ext' | 'body'>,
  components: Record<string, ComponentType<any>> = {},
): ReactNode {
  const proc = note.ext === 'mdx' ? processors.mdx : processors.md;
  if (!proc) return null;
  try {
    const hast = proc.runSync(proc.parse(note.body));
    appLinks(hast, hrefOf(note));
    return toJsxRuntime(hast as any, {
      Fragment,
      jsx: jsx as any,
      jsxs: jsxs as any,
      components: { ...components, pre: Pre } as any,
      elementAttributeNameCase: 'react',
      stylePropertyNameCase: 'dom',
      createEvaluater: evaluater(components),
    });
  } catch (e) {
    return jsx('p', {
      className: 'render-error',
      children: `${note.path} doesn't render: ${(e as Error).message}`,
    });
  }
}

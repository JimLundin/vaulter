// What a note's body links to and what its links can point at: notes knows the syntax (Markdown links,
// vault links like [label](</Note.md#heading>), GitHub's heading slugs); the graph reads only these.
import type { Nodes, Root } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import GithubSlugger from 'github-slugger';
import { toString as textOf } from 'mdast-util-to-string';
import { parseVaultLink } from './paths.ts';
import { clip, plain, type Note } from './fields.ts';

const parser = unified().use(remarkParse).use(remarkGfm);
export const walk = (n: Nodes, f: (n: Nodes) => void) => {
  f(n);
  if ('children' in n) for (const c of n.children) walk(c, f);
};

/** The body's Markdown tree, parsed once per note. */
const trees = new WeakMap<Note, Root>();
export const treeOf = (n: Note): Root => {
  let t = trees.get(n);
  if (!t) {
    t = parser.parse(n.body);
    trees.set(n, t);
  }
  return t;
};

/** Every URL the body links to: links, definitions and images, and in .mdx a component's href. */
export function urlsOf(n: Note): string[] {
  const out: string[] = [];
  walk(treeOf(n), (x) => {
    if (x.type === 'link' || x.type === 'definition' || x.type === 'image') out.push(x.url);
  });
  if (n.ext === 'mdx')
    for (const m of n.body.matchAll(/href\s*[:=]\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

/** The heading ids a link's #anchor can name (GitHub's slugs, as the app renders them). */
const anchors = new WeakMap<Note, Set<string>>();
export const anchorsOf = (n: Note): Set<string> => {
  let s = anchors.get(n);
  if (!s) {
    const slugger = new GithubSlugger();
    s = new Set<string>();
    const set = s;
    walk(treeOf(n), (x) => {
      if (x.type === 'heading') set.add(slugger.slug(textOf(x)));
    });
    anchors.set(n, s);
  }
  return s;
};

/** Links in the source text: [label](</Path.md#h>) or [label](/Path.md). */
const LINK_RE = /\[([^\]]*)\]\(<?(\/[^)>]+?\.mdx?(?:#[^)>]*)?)>?\)/g;

/** Each note the body links to, once, with the line it's on as plain text: what a backlink shows. */
export function linksOf(n: Note): { id: string; context: string }[] {
  const out: { id: string; context: string }[] = [];
  const seen = new Set<string>();
  for (const line of n.body.split('\n'))
    for (const m of line.matchAll(LINK_RE)) {
      const p = parseVaultLink(m[2]);
      if (!p || p.id === n.id || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ id: p.id, context: clip(plain(line), 260) });
    }
  return out;
}

// What an .mdx note may contain beyond Markdown: the components the vault allows (meta/schema.yaml),
// self-closing, with string or literal props (numbers, booleans, null, arrays and plain objects of those), and {/* comments */}.
// No import/export, no other {expressions}, no HTML tags. Notes are data, never code: the page that
// renders them holds a token that can write to the vault, and an agent writes the notes.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import type { Nodes, Root } from 'mdast';
import type {} from 'mdast-util-mdx'; // registers the MDX node types
import { literal, isComment } from './mdx-literal.ts';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);
const walk = (n: Nodes, f: (n: Nodes) => void) => {
  f(n);
  if ('children' in n) for (const c of n.children) walk(c, f);
};
const at = (n: Nodes) => (n.position ? ` (line ${n.position.start.line})` : '');

/** Problems with an .mdx body, as messages without the file name. */
export function mdxProblems(body: string, components: string[]): string[] {
  let tree: Root;
  try {
    tree = parser.parse(body);
  } catch (e: any) {
    return [`MDX does not parse: ${e.reason || e.message}${e.line ? ` (line ${e.line})` : ''}`];
  }
  const out: string[] = [];
  walk(tree, (n) => {
    if (n.type === 'mdxjsEsm') out.push(`import/export is not allowed in a note${at(n)}`);
    else if ((n.type === 'mdxFlowExpression' || n.type === 'mdxTextExpression') && !isComment(n))
      out.push(`{…} expressions are not allowed in a note${at(n)}`);
    else if (n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') {
      if (!(n.name && components.includes(n.name))) {
        out.push(`<${n.name ?? ''}> is not a component (${components.join(', ')})${at(n)}`);
        return;
      }
      if (n.children.length) out.push(`<${n.name}> takes no children; close it with />${at(n)}`);
      for (const a of n.attributes) {
        if (a.type !== 'mdxJsxAttribute') {
          out.push(`<${n.name}>: {...spread} props are not allowed${at(n)}`);
          continue;
        }
        if (a.value && typeof a.value === 'object') {
          const e = a.value.data?.estree?.body?.[0];
          try {
            if (e?.type !== 'ExpressionStatement') throw new Error('empty');
            literal(e.expression);
          } catch (err: any) {
            out.push(`<${n.name}> ${a.name}={…} must be a literal value: ${err.message}${at(n)}`);
          }
        }
      }
    }
  });
  return out;
}

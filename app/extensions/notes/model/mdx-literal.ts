// What a note's MDX props and expressions may be: literals only, never code. Used by the check
// (mdx-rules.ts) and by the renderer, which resolves props through `literal` instead of eval.
import type { Node as EsNode } from 'estree';

/** A {…} that holds only a comment: allowed, and dropped when rendering. */
export const isComment = (n: { type: string; data?: unknown }) =>
  (n.type === 'mdxFlowExpression' || n.type === 'mdxTextExpression') &&
  (n.data as any)?.estree?.body.length === 0;

const KEY = (p: { key: EsNode }) =>
  p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : '';

/**
 * An ESTree expression -> its value, if it is a literal; throws otherwise. `names` resolves bare
 * identifiers (the renderer passes the component table; props get none).
 */
export function literal(
  node: EsNode | null | undefined,
  names: Record<string, unknown> = {},
): unknown {
  switch (node?.type) {
    case 'Literal':
      if ('regex' in node || 'bigint' in node) break;
      return node.value;
    case 'TemplateLiteral':
      if (node.expressions.length) break;
      return node.quasis.map((q) => q.value.cooked).join('');
    case 'UnaryExpression':
      if (
        (node.operator === '-' || node.operator === '+') &&
        node.argument.type === 'Literal' &&
        typeof node.argument.value === 'number'
      )
        return node.operator === '-' ? -node.argument.value : node.argument.value;
      break;
    case 'ArrayExpression':
      return node.elements.map((e) => (e === null ? null : literal(e)));
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      for (const p of node.properties) {
        if (p.type !== 'Property' || p.computed || p.kind !== 'init' || p.method || p.shorthand)
          throw new Error('only plain { key: value } objects');
        const k = KEY(p);
        if (k === '__proto__') throw new Error('no __proto__ keys');
        out[k] = literal(p.value);
      }
      return out;
    }
    case 'Identifier':
      if (Object.hasOwn(names, node.name)) return names[node.name];
      break;
    default:
      break;
  }
  throw new Error(`not a literal (${node?.type ?? 'nothing'})`);
}

// Deterministic plain text for citation offsets, shared by migration and Wiki reads.
import type { NodeVersion } from '../nodes/model.ts';
import type { NodeSnapshot } from '../nodes/store.ts';

/** UTF-16 text without markup. Adjacent inline fragments concatenate; blocks use newlines,
 * table cells use tabs, citations and structural relationships contribute no text. */
export function recordText(node: NodeVersion, view: NodeSnapshot): string {
  const visit = (version: NodeVersion, path: Set<string>): string => {
    const key = JSON.stringify(version.key);
    if (!version.data || path.has(key)) return '';
    const { data } = version;
    if (['cite', 'relationship', 'reference', 'metadataReference'].includes(String(data.kind)))
      return '';
    if (typeof data.text === 'string') return data.text;
    if (typeof data.content === 'string') return data.content;
    if (Array.isArray(data.parts))
      return data.parts
        .map((part) =>
          part &&
          typeof part === 'object' &&
          !Array.isArray(part) &&
          part.kind === 'text' &&
          typeof part.text === 'string'
            ? part.text
            : '',
        )
        .join('');
    const next = new Set(path).add(key);
    const children = view.children(version.key);
    if (data.kind === 'item') {
      const inline = children.filter((child) => ['run', 'link'].includes(String(child.data?.kind)));
      const blocks = children.filter(
        (child) => !['run', 'link', 'cite'].includes(String(child.data?.kind)),
      );
      return [
        inline.map((child) => visit(child, next)).join(''),
        ...blocks.map((child) => visit(child, next)),
      ]
        .filter(Boolean)
        .join('\n');
    }
    const separator = ['paragraph', 'heading', 'cell'].includes(String(data.kind))
      ? ''
      : data.kind === 'row'
        ? '\t'
        : '\n';
    const textChildren = children.filter(
      (child) =>
        !['cite', 'relationship', 'reference', 'metadataReference'].includes(
          String(child.data?.kind),
        ),
    );
    const fragments = textChildren.map((child) => visit(child, next));
    if (data.kind === 'exchange' && typeof data.preamble === 'string')
      fragments.unshift(data.preamble);
    return (data.kind === 'row' ? fragments : fragments.filter(Boolean)).join(separator);
  };
  return visit(node, new Set());
}

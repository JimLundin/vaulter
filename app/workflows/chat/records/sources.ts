import type { NodeVersion } from '../../../vault/nodes/model.ts';
import type { SourceReader } from '../../../vault/sources.ts';

const proseContainers = new Set([
  'conversation',
  'exchange',
  'observation',
  'attachment',
  'interpretation',
]);
const relationships = new Set(['reference', 'metadataReference']);
const ownedKinds = new Set([...proseContainers, ...relationships, 'message']);

function messageText(node: NodeVersion): string | undefined {
  const { data } = node;
  if (data?.kind !== 'message') return;
  if (typeof data.text === 'string') return data.text;
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
}

/** Retained Chat prose has stable UTF-16 offsets; tool parts never contribute words. */
export function chatSources(conversationHref?: (node: string) => string): SourceReader {
  return {
    exactText: messageText,
    text(node, { view, textOf }) {
      const { data } = node;
      if (!data || typeof data.kind !== 'string' || !ownedKinds.has(data.kind)) return;
      if (relationships.has(data.kind)) return '';
      const message = messageText(node);
      if (message !== undefined) return message;
      const fragments = view.children(node.key).map(textOf);
      if (data.kind === 'exchange' && typeof data.preamble === 'string')
        fragments.unshift(data.preamble);
      return fragments.filter(Boolean).join('\n');
    },
    describe(node, view) {
      if (!node.data || typeof node.data.kind !== 'string' || !ownedKinds.has(node.data.kind))
        return;
      let ancestor: NodeVersion | undefined = node;
      let message: NodeVersion | undefined;
      let exchange: NodeVersion | undefined;
      let conversation: NodeVersion | undefined;
      let title: string | undefined;
      const seen = new Set<string>();
      while (ancestor?.data && !seen.has(ancestor.key.node)) {
        seen.add(ancestor.key.node);
        const { data } = ancestor;
        if (title === undefined && typeof data.title === 'string' && data.title) ({ title } = data);
        if (data.kind === 'message') message ??= ancestor;
        if (data.kind === 'exchange') exchange ??= ancestor;
        if (data.kind === 'conversation') conversation ??= ancestor;
        ancestor = ancestor.placement ? view.get(ancestor.placement.parent) : undefined;
      }
      const role = message?.data?.role;
      const at = node.data.at ?? message?.data?.at ?? exchange?.data?.startedAt;
      return {
        title: title ?? '',
        href: conversation && conversationHref?.(conversation.key.node),
        date: typeof at === 'string' ? at : undefined,
        speaker: role === 'user' || role === 'agent' ? role : undefined,
        capture: node.data?.kind === 'exchange' || node.data?.kind === 'message',
      };
    },
  };
}

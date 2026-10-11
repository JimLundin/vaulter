import type { z } from 'zod';
import type { NodeAddress, NodeVersion } from '../nodes/model.ts';
import type { NodeSnapshot } from '../nodes/store.ts';
import { citation, textSelection } from './wiki.ts';
import { recordText } from './text.ts';

export type TextSelection = z.infer<typeof textSelection>;
export interface SelectedText {
  node: NodeVersion;
  context: string;
  text: string;
  range: TextSelection;
}

/** Wiki pages distill source material. Their descendants belong to that same collection. */
export function isWikiContent(node: NodeVersion, view: NodeSnapshot): boolean {
  const seen = new Set<string>();
  let current: NodeVersion | undefined = node;
  while (current && !seen.has(current.key.node)) {
    if (current.data?.kind === 'page') return true;
    seen.add(current.key.node);
    current = current.placement ? view.get(current.placement.parent) : undefined;
  }
  return false;
}

/** Select an exact endpoint at the recorded containment snapshot. Never fall back to live text. */
export function selectText(
  address: NodeAddress,
  selection: TextSelection,
  view: NodeSnapshot,
): SelectedText {
  textSelection.parse(selection);
  if (!address.transaction) throw new Error('Text selections require exact endpoints');
  if (view.sequence !== selection.sequence) throw new Error('Selection snapshot does not match');
  const node = view.resolve(address);
  if (!node?.data || view.get(address.node)?.key.transaction !== address.transaction)
    throw new Error('Endpoint was not live at the selected snapshot');
  const context = recordText(node, view);
  const boundary = (offset: number) => {
    if (offset === 0 || offset === context.length) return true;
    const before = context.charCodeAt(offset - 1);
    const after = context.charCodeAt(offset);
    return !(before >= 0xd8_00 && before <= 0xdb_ff && after >= 0xdc_00 && after <= 0xdf_ff);
  };
  if (selection.end > context.length || !boundary(selection.start) || !boundary(selection.end))
    throw new Error('Selection is outside text or splits a UTF-16 surrogate pair');
  return { node, context, text: context.slice(selection.start, selection.end), range: selection };
}

/** Feature-level integrity above the generic store. Existence does not establish evidential support. */
export function readCitation(
  node: NodeVersion,
  snapshot: (sequence: number) => NodeSnapshot,
): { claim: SelectedText; passage: SelectedText } {
  const data = citation.parse(node.data);
  if (!('claim' in data)) throw new Error('Citation has no passage selection');
  if (!node.connection) throw new Error('Citation requires a connection');
  const source = snapshot(data.passage.sequence);
  const passage = selectText(node.connection.target, data.passage, source);
  if (isWikiContent(passage.node, source))
    throw new Error('Wiki content is distilled material, not a citation source');
  return {
    claim: selectText(node.connection.source, data.claim, snapshot(data.claim.sequence)),
    passage,
  };
}

import type { NodeSnapshot } from '../../vault/nodes/store.ts';
import type { NodeVersion } from '../../vault/nodes/model.ts';
import type { SourceReader } from '../../vault/sources.ts';
import { recordText } from './text.ts';
import { isWikiContent } from './citations.ts';

const isSourceSection = (node: NodeVersion, view: NodeSnapshot, sources: SourceReader) => {
  const heading = node.data?.kind === 'section' ? view.children(node.key.node)[0] : undefined;
  return !!(
    heading &&
    /^(references?|sources?|provenance)\s*:?$/i.test(recordText(heading, view, sources).trim())
  );
};

/** Only explicit source sections, source relationships and capture links establish page provenance.
 * Ordinary hyperlinks do not establish support for the nearby statement. Original nodes stay put. */
export function pageReferenceLinks(
  page: NodeVersion,
  view: NodeSnapshot,
  sources: SourceReader,
): NodeVersion[] {
  const result: NodeVersion[] = [];
  const visit = (node: NodeVersion, sourceSection: boolean) => {
    const children = view.children(node.key.node);
    const within = sourceSection || isSourceSection(node, view, sources);
    const target = node.connection && view.resolve(node.connection.target);
    const source = !(target && isWikiContent(target, view));
    if (
      source &&
      node.data?.kind === 'link' &&
      (within || (target && sources.describe(target, view)?.capture))
    )
      result.push(node);
    if (source && node.data?.kind === 'relationship' && node.data.predicate === 'source')
      result.push(node);
    for (const child of children) visit(child, within);
  };
  visit(page, false);
  return result;
}

/** Wiki identifies reviewable statements; callers may rank and bound the resulting text. */
export function wikiClaims(page: NodeVersion, view: NodeSnapshot, sources: SourceReader) {
  const claims: { node: NodeVersion; text: string }[] = [];
  const visit = (node: NodeVersion, within: boolean) => {
    const source = within || isSourceSection(node, view, sources);
    if (!source && ['paragraph', 'item', 'cell'].includes(String(node.data?.kind)))
      claims.push({ node, text: recordText(node, view, sources) });
    for (const child of view.children(node.key.node)) visit(child, source);
  };
  visit(page, false);
  return claims;
}

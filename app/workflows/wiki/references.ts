import type { NodeSnapshot } from '../../vault/nodes/store.ts';
import type { NodeVersion } from '../../vault/nodes/model.ts';
import { recordText } from '../../vault/records/text.ts';
import { isWikiContent } from '../../vault/records/citations.ts';

/** Only explicit source sections, source relationships and capture links establish page provenance.
 * Ordinary hyperlinks do not establish support for the nearby statement. Original nodes stay put. */
export function pageReferenceLinks(page: NodeVersion, view: NodeSnapshot): NodeVersion[] {
  const result: NodeVersion[] = [];
  const visit = (node: NodeVersion, sourceSection: boolean) => {
    const children = view.children(node.key.node);
    const heading = node.data?.kind === 'section' ? children[0] : undefined;
    const within =
      sourceSection ||
      !!(
        heading &&
        /^(references?|sources?|provenance)\s*:?$/i.test(recordText(heading, view).trim())
      );
    const target = node.connection && view.resolve(node.connection.target);
    const source = !(target && isWikiContent(target, view));
    if (
      source &&
      node.data?.kind === 'link' &&
      (within || ['exchange', 'message'].includes(String(target?.data?.kind)))
    )
      result.push(node);
    if (source && node.data?.kind === 'relationship' && node.data.predicate === 'source')
      result.push(node);
    for (const child of children) visit(child, within);
  };
  visit(page, false);
  return result;
}

import type { NodeVersion } from '@/vault/nodes/model.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import type { SourceDescription, SourceReader } from '@/vault/sources.ts';
import { wikiSchemas } from './records.ts';
import { pageRoute } from './routes.ts';

/** Only inline text held in a Wiki version is self-contained; container prose needs a Snapshot. */
export const wikiSources: SourceReader = {
  exactText(node) {
    const { data } = node;
    if (!(data && Object.hasOwn(wikiSchemas, String(data.kind)))) return;
    if (typeof data.text === 'string') return data.text;
  },
  text: () => undefined,
  describe: describeWikiTarget,
};

/** Wiki owns the page ancestry and navigation of any record placed within its collection. */
export function describeWikiTarget(
  node: NodeVersion,
  view: NodeSnapshot,
): (SourceDescription & { readonly navigationLabel?: string }) | undefined {
  let current: NodeVersion | undefined = node;
  const seen = new Set<string>();
  while (current?.data && !seen.has(current.key.node)) {
    seen.add(current.key.node);
    if (current.data.kind === 'page')
      return {
        title: String(current.data.title ?? 'Wiki page'),
        href: `#${pageRoute.href({ node: current.key.node })}`,
        navigationLabel: `Open Wiki page: ${String(current.data.title ?? 'Wiki page')}`,
      };
    current = current.placement ? view.get(current.placement.parent) : undefined;
  }
}

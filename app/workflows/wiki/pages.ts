import type { JsonObject, NodeVersion, Transaction } from '../../vault/nodes/model.ts';
import type { NodeSnapshot, NodeStore } from '../../vault/nodes/store.ts';
import type { Entry } from '../../vault/documents/search.ts';
import { pattern } from '../../ui/routing.ts';
import { recordText } from '../../vault/records/text.ts';
import { citation as citationSchema } from '../../vault/records/wiki.ts';
import { isWikiContent, readCitation } from '../../vault/records/citations.ts';
import { pageReferenceLinks } from './references.ts';

export interface WikiReference {
  id: string;
  title: string;
  text: string;
  context: string;
  range?: { start: number; end: number };
  claim?: { start: number; end: number };
  date?: string;
  author?: string;
  href?: string;
  state: 'original' | 'newer' | 'deleted';
  source: { node: string; transaction: string };
  sequence: number;
  speaker?: 'user' | 'agent';
}
export interface WikiClassification {
  id: string;
  relationship: string;
  scheme: string;
  key: string;
  label: string;
  state: 'resolved' | 'unresolved' | 'deleted';
}

export const wikiRoute = pattern('/wiki/');
export const pageRoute = pattern('/wiki/:node/');
export interface WikiBlock {
  id: string;
  data: JsonObject;
  children: WikiBlock[];
  href?: string;
  evidence: WikiReference[];
}
export interface WikiPage {
  id: string;
  title: string;
  summary: string;
  kind: string;
  updated: string;
  blocks: WikiBlock[];
  entry: Entry;
  metadata: WikiClassification[];
  sources: WikiReference[];
}

/** Read the live collection; exact citation targets retain their original text after later edits. */
export async function readWiki(
  nodes: NodeStore,
  conversationHref?: (node: string) => string,
): Promise<WikiPage[]> {
  const snapshot = await nodes.snapshot();
  const transactions = new Map<string, Transaction>();
  let beforeSequence: number | undefined;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: the next cursor depends on this batch
    const batch = await nodes.history({ beforeSequence, limit: 200 });
    for (const transaction of batch) transactions.set(transaction.id, transaction);
    if (batch.length < 200) break;
    beforeSequence = Math.min(...batch.map((transaction) => transaction.sequence));
  }
  const historical = new Map<number, NodeSnapshot>();
  const all: NodeVersion[] = [];
  const visited = new Set<string>();
  const collect = (node: NodeVersion) => {
    if (!node.data || visited.has(node.key.node)) return;
    visited.add(node.key.node);
    all.push(node);
    for (const child of snapshot.children(node.key.node)) collect(child);
  };
  for (const root of snapshot.roots()) collect(root);
  const pageNodes = all.filter(
    (node) => node.data?.kind === 'page' || node.data?.kind === 'content',
  );
  const sourceSequences = new Set<number>();
  const referenceNodes = [
    ...all.filter((node) => node.data?.kind === 'cite'),
    ...pageNodes.flatMap((page) => pageReferenceLinks(page, snapshot)),
  ];
  for (const node of referenceNodes) {
    if (node.data?.kind === 'cite') {
      const data = citationSchema.parse(node.data);
      if ('claim' in data) {
        sourceSequences.add(data.claim.sequence);
        sourceSequences.add(data.passage.sequence);
      } else if ('sequence' in data) sourceSequences.add(data.sequence);
    }
    if (node.connection) {
      const target = snapshot.resolve(node.connection.target);
      const transaction = target && transactions.get(target.key.transaction);
      if (transaction) sourceSequences.add(transaction.sequence);
    }
  }
  await Promise.all(
    [...sourceSequences].map(async (sequence) => {
      historical.set(sequence, await nodes.snapshot(sequence));
    }),
  );
  const pageOf = (node: NodeVersion): NodeVersion | undefined => {
    const seen = new Set<string>();
    let current: NodeVersion | undefined = node;
    while (current && !seen.has(current.key.node)) {
      if (current.data?.kind === 'page' || current.data?.kind === 'content') return current;
      seen.add(current.key.node);
      current = current.placement ? snapshot.get(current.placement.parent) : undefined;
    }
    return undefined;
  };
  const hrefOf = (node: NodeVersion | undefined) => {
    if (!node?.data) return;
    if (node.data.kind === 'resource' && typeof node.data.url === 'string') return node.data.url;
    if (node.data.kind === 'conversation') return conversationHref?.(node.key.node);
    let ancestor = node;
    const seen = new Set<string>();
    while (ancestor.placement && !seen.has(ancestor.key.node)) {
      seen.add(ancestor.key.node);
      const parent = snapshot.get(ancestor.placement.parent);
      if (!parent?.data) break;
      if (parent.data.kind === 'conversation') return conversationHref?.(parent.key.node);
      ancestor = parent;
    }
    const parent = pageOf(node);
    return parent
      ? `#${pageRoute.href({ node: parent.key.node })}${parent !== node ? `#${encodeURIComponent(node.key.node)}` : ''}`
      : undefined;
  };
  const referenceOf = (citation: NodeVersion): WikiReference | undefined => {
    if (!citation.connection) return;
    const source = snapshot.resolve(citation.connection.target);
    if (!source?.data) return;
    const transaction = transactions.get(source.key.transaction);
    let view =
      citation.connection.target.transaction && transaction
        ? historical.get(transaction.sequence)
        : snapshot;
    let context: string;
    let text: string;
    let range: WikiReference['range'];
    let claim: WikiReference['claim'];
    if (citation.data?.scope === 'page' && typeof citation.data.sequence === 'number') {
      view = historical.get(citation.data.sequence);
      if (!view || view.get(source.key.node)?.key.transaction !== source.key.transaction)
        throw new Error('Page reference endpoint does not match its snapshot');
    }
    if (citation.data?.claim) {
      const selection = readCitation(citation, (sequence) => {
        const selected = historical.get(sequence);
        if (!selected) throw new Error('Citation snapshot is unavailable');
        return selected;
      });
      ({ context, text, range } = selection.passage);
      claim = selection.claim.range;
      view = historical.get(selection.passage.range.sequence);
    } else {
      if (!view) throw new Error('Reference snapshot is unavailable');
      if (isWikiContent(source, view)) return;
      context = recordText(source, view);
      text = context;
    }
    const current = snapshot.get(source.key.node);
    // Descendant-only edits can change a composite's text without changing its own version.
    const state = !current?.data
      ? 'deleted'
      : current.key.transaction !== source.key.transaction ||
          recordText(current, snapshot) !== context
        ? 'newer'
        : 'original';
    const author = transaction
      ? historical.get(transaction.sequence)?.get(transaction.recordedBy)
      : undefined;
    let container = source;
    while (container.placement && !container.data?.title) {
      const parent = view?.get(container.placement.parent);
      if (!parent?.data) break;
      container = parent;
    }
    const title = String(
      source.data.title ??
        container.data?.title ??
        (source.data.kind === 'resource' ? source.data.url : '') ??
        '',
    );
    return {
      id: citation.key.node,
      title: title || String(citation.data?.text ?? 'Reference'),
      text,
      context,
      range,
      claim,
      state,
      source: source.key,
      sequence: view?.sequence ?? snapshot.sequence,
      speaker:
        source.data.kind === 'message' &&
        (source.data.role === 'user' || source.data.role === 'agent')
          ? source.data.role
          : undefined,
      date: typeof source.data.at === 'string' ? source.data.at : transaction?.recordedAt,
      author: String(author?.data?.name ?? ''),
      href: hrefOf(source),
    };
  };
  const kindOf = (node: NodeVersion) => {
    const relation = snapshot
      .children(node.key.node)
      .find((child) => child.data?.kind === 'relationship' && child.data.predicate === 'type');
    return String(
      (relation?.connection
        ? snapshot.resolve(relation.connection.target)?.data?.key
        : undefined) ?? 'page',
    );
  };
  const tagsOf = (node: NodeVersion) =>
    snapshot
      .children(node.key.node)
      .filter((child) => child.data?.kind === 'relationship' && child.data.predicate === 'tag')
      .map((child) =>
        String(
          (child.connection ? snapshot.resolve(child.connection.target)?.data?.key : undefined) ??
            child.data?.label ??
            '',
        ),
      );
  const blockOf = (node: NodeVersion, seen = new Set<string>()): WikiBlock => {
    const next = new Set(seen).add(node.key.node);
    const children = snapshot.children(node.key.node).filter((child) => !next.has(child.key.node));
    const citations = children.filter((child) => child.data?.kind === 'cite' && child.connection);
    const evidence = citations
      .filter((citation) => citation.data?.scope !== 'page')
      .flatMap((citation) => {
        // Exact claim selections no longer apply to edited live prose. Retain the citation in history.
        if (citation.data?.claim && citation.connection) {
          const claim = snapshot.get(citation.connection.source.node);
          const selected = referenceOf(citation);
          const data = citationSchema.parse(citation.data);
          if ('claim' in data) {
            const view = historical.get(data.claim.sequence);
            const original = view?.resolve(citation.connection.source);
            if (
              !(claim?.data && original && view) ||
              claim.key.node !== node.key.node ||
              recordText(claim, snapshot) !== recordText(original, view)
            )
              return [];
          }
          return selected ? [selected] : [];
        }
        const reference = referenceOf(citation);
        return reference ? [reference] : [];
      });
    return {
      id: node.key.node,
      data:
        node.data?.kind === 'relationship' && node.connection
          ? {
              ...node.data,
              label: String(
                snapshot.resolve(node.connection.target)?.data?.label ??
                  snapshot.resolve(node.connection.target)?.data?.title ??
                  snapshot.resolve(node.connection.target)?.data?.key ??
                  node.data.label ??
                  'Unavailable target',
              ),
            }
          : node.data!,
      children:
        node.data?.kind === 'query'
          ? pageNodes
              .filter(
                (page) =>
                  (!node.data?.type || kindOf(page) === node.data.type) &&
                  (!node.data?.tag || tagsOf(page).includes(String(node.data.tag))),
              )
              .sort((a, b) =>
                String(
                  node.data?.sort === 'created' ? (a.data?.created ?? '') : (a.data?.title ?? ''),
                ).localeCompare(
                  String(
                    node.data?.sort === 'created' ? (b.data?.created ?? '') : (b.data?.title ?? ''),
                  ),
                ),
              )
              .map((page) => ({
                id: `${node.key.node}:${page.key.node}`,
                data: { kind: 'link', text: String(page.data?.title ?? 'Untitled page') },
                children: [],
                href: hrefOf(page),
                evidence: [],
              }))
          : children.map((child) => blockOf(child, next)),
      href: hrefOf(node.connection ? snapshot.resolve(node.connection.target) : undefined),
      evidence,
    };
  };
  return pageNodes
    .map((node) => {
      const data = node.data!;
      const children = snapshot.children(node.key.node);
      const classifications = children.filter(
        (child) =>
          child.data?.kind === 'relationship' &&
          ['type', 'tag'].includes(String(child.data.predicate)),
      );
      const metadata: WikiClassification[] = classifications.map((relationship) => {
        const target = relationship.connection && snapshot.resolve(relationship.connection.target);
        return {
          id: target?.key.node ?? relationship.key.node,
          relationship: relationship.key.node,
          scheme: String(target?.data?.scheme ?? 'unresolved'),
          key: String(target?.data?.key ?? relationship.data?.label ?? ''),
          label: String(
            target?.data?.label ??
              target?.data?.key ??
              relationship.data?.label ??
              'Unavailable term',
          ),
          state: !relationship.connection ? 'unresolved' : target?.data ? 'resolved' : 'deleted',
        };
      });
      const blocks = children
        .filter((child) => !classifications.includes(child) && child.data?.kind !== 'cite')
        .map((child) => blockOf(child));
      const explicit = children.filter(
        (child) => child.data?.kind === 'cite' && child.data.scope === 'page',
      );
      const links = pageReferenceLinks(node, snapshot);
      const referenced = new Set(explicit.map((child) => child.connection?.target.node));
      const sources = [
        ...explicit,
        ...links.filter((link) => !referenced.has(link.connection?.target.node)),
      ]
        .flatMap((reference) => {
          const source = referenceOf(reference);
          return source ? [source] : [];
        })
        .filter(
          (source, index, list) =>
            list.findIndex(
              (other) =>
                other.source.node === source.source.node &&
                other.source.transaction === source.source.transaction &&
                other.sequence === source.sequence,
            ) === index,
        );
      if (data.kind === 'content' && typeof data.text === 'string')
        blocks.unshift({
          id: `${node.key.node}:body`,
          data: { kind: 'paragraph', text: data.text },
          children: [],
          evidence: [],
        });
      const kind = kindOf(node);
      const title = String(data.title ?? 'Untitled page');
      const summary = String(data.summary ?? '');
      return {
        id: node.key.node,
        title,
        summary,
        kind,
        blocks,
        metadata,
        sources,
        updated: (() => {
          const versions: NodeVersion[] = [];
          const collectVersions = (version: NodeVersion) => {
            versions.push(version);
            for (const child of snapshot.children(version.key.node))
              if (child.data?.kind !== 'cite') collectVersions(child);
          };
          collectVersions(node);
          const [latest] = versions
            .map((version) => transactions.get(version.key.transaction))
            .filter((transaction) => !!transaction)
            .sort((a, b) => b.sequence - a.sequence);
          return latest?.recordedAt ?? '';
        })(),
        entry: {
          href: pageRoute.href({ node: node.key.node }),
          t: title,
          e: summary,
          a: Array.isArray(data.aliases) ? data.aliases.map(String) : [],
          k: 'page',
          g: tagsOf(node),
        },
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

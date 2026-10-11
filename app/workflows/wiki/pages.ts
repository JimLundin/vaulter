import type { JsonObject, NodeVersion } from '../../vault/nodes/model.ts';
import type { NodeSnapshot, NodeStore } from '../../vault/nodes/store.ts';
import type { Entry } from '../../vault/documents/search.ts';
import { pattern } from '../../ui/routing.ts';

export const wikiRoute = pattern('/wiki/');
export const pageRoute = pattern('/wiki/:node/');
export interface WikiBlock {
  id: string;
  data: JsonObject;
  children: WikiBlock[];
  href?: string;
  evidence: { id: string; text: string; date?: string; author?: string; href?: string }[];
}
export interface WikiPage {
  id: string;
  title: string;
  summary: string;
  kind: string;
  updated: string;
  blocks: WikiBlock[];
  entry: Entry;
}

/** Read the live collection; exact citation targets retain their original text after later edits. */
export async function readWiki(
  nodes: NodeStore,
  conversationHref?: (node: string) => string,
): Promise<WikiPage[]> {
  const snapshot = await nodes.snapshot();
  const transactions = new Map((await nodes.history()).map((t) => [t.id, t]));
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
  const sourceSequences = new Set(
    all.flatMap((node) => {
      if (!(['cite', 'link'].includes(String(node.data?.kind)) && node.connection)) return [];
      const source = snapshot.resolve(node.connection.target);
      if (
        node.data?.kind === 'link' &&
        source?.data?.kind !== 'exchange' &&
        source?.data?.kind !== 'message'
      )
        return [];
      const transaction = source && transactions.get(source.key.transaction);
      return transaction ? [transaction.sequence] : [];
    }),
  );
  await Promise.all(
    [...sourceSequences].map(async (sequence) => {
      historical.set(sequence, await nodes.snapshot(sequence));
    }),
  );
  const pageNodes = all.filter(
    (node) => node.data?.kind === 'page' || node.data?.kind === 'content',
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
  const textOf = (node: NodeVersion, view: NodeSnapshot, seen = new Set<string>()): string => {
    const key = `${node.key.node}:${node.key.transaction}`;
    if (!node.data || seen.has(key)) return '';
    seen.add(key);
    if (typeof node.data.text === 'string') return node.data.text;
    if (typeof node.data.content === 'string') return node.data.content;
    if (Array.isArray(node.data.parts))
      return node.data.parts
        .map((part) =>
          part && typeof part === 'object' && !Array.isArray(part) && typeof part.text === 'string'
            ? part.text
            : '',
        )
        .join('');
    return view
      .children(node.key)
      .map((child) => textOf(child, view, seen))
      .join(' ');
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
    if (node.data?.kind === 'link' && node.connection) {
      const target = snapshot.resolve(node.connection.target);
      if (target?.data?.kind === 'exchange' || target?.data?.kind === 'message')
        citations.push(node);
    }
    const evidence = citations.flatMap((citation) => {
      const source = snapshot.resolve(citation.connection!.target);
      if (!source?.data) return [];
      const transaction = transactions.get(source.key.transaction);
      const view =
        citation.connection!.target.transaction && transaction
          ? historical.get(transaction.sequence)!
          : snapshot;
      return [
        {
          id: `${source.key.node}:${source.key.transaction}`,
          text: textOf(source, view),
          date: typeof source.data.at === 'string' ? source.data.at : transaction?.recordedAt,
          author: String(
            (transaction ? historical.get(transaction.sequence) : snapshot)?.get(
              transaction?.recordedBy ?? '',
            )?.data?.name ?? '',
          ),
          href: hrefOf(source),
        },
      ];
    });
    return {
      id: node.key.node,
      data: node.data!,
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
      const blocks = snapshot.children(node.key.node).map((child) => blockOf(child));
      if (data.kind === 'content' && typeof data.text === 'string')
        blocks.unshift({
          id: `${node.key.node}:body`,
          data: { kind: 'paragraph', text: data.text },
          children: [],
          evidence: [],
        });
      const relationships = blocks.filter((block) => block.data.kind === 'relationship');
      const kind = kindOf(node);
      const title = String(data.title ?? 'Untitled page');
      const summary = String(data.summary ?? '');
      return {
        id: node.key.node,
        title,
        summary,
        kind,
        blocks,
        updated: transactions.get(node.key.transaction)?.recordedAt ?? '',
        entry: {
          href: pageRoute.href({ node: node.key.node }),
          t: title,
          e: summary,
          a: Array.isArray(data.aliases) ? data.aliases.map(String) : [],
          k: 'page',
          g: relationships
            .filter((block) => block.data.predicate === 'tag')
            .map((block) => {
              const ref = snapshot.get(block.id)?.connection?.target;
              return String(
                (ref ? snapshot.resolve(ref)?.data?.key : undefined) ?? block.data.label ?? '',
              );
            }),
        },
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

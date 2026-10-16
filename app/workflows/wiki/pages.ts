import type { JsonObject, NodeVersion, Transaction } from '../../vault/nodes/model.ts';
import type { NodeSnapshot, NodeReading } from '../../vault/nodes/store.ts';
import type { Entry } from '../../search/entries.ts';
import { recordText, UnsupportedSourceRecordError } from './text.ts';
import { citation as citationSchema } from './records.ts';
import { isWikiContent, readCitation, validatePageReference } from './citations.ts';
import { pageReferenceLinks } from './references.ts';
import type { SourceReader } from '../../vault/sources.ts';
import type { WikiRelatedContentReading } from './related-content.ts';

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
  nodes: NodeReading,
  sources: SourceReader,
  relatedContent: WikiRelatedContentReading,
): Promise<WikiPage[]> {
  const snapshot = await nodes.snapshot();
  const related = relatedContent(snapshot);
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
  const pageNodes = all.filter((node) => node.data?.kind === 'page');
  const sourceSequences = new Set<number>();
  const referenceNodes = [
    ...all.filter((node) => node.data?.kind === 'cite'),
    ...pageNodes.flatMap((page) => pageReferenceLinks(page, snapshot, sources)),
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
      if (current.data?.kind === 'page') return current;
      seen.add(current.key.node);
      current = current.placement ? snapshot.get(current.placement.parent) : undefined;
    }
    return undefined;
  };
  const hrefOf = (node: NodeVersion | undefined) => {
    if (!node?.data) return;
    const parent = pageOf(node);
    return parent
      ? `#/wiki/${encodeURIComponent(parent.key.node)}/${parent !== node ? `#${encodeURIComponent(node.key.node)}` : ''}`
      : sources.describe(node, snapshot)?.href;
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
    const atSnapshot = (sequence: number) => {
      const selected = historical.get(sequence);
      if (!selected) throw new Error('Citation snapshot is unavailable');
      return selected;
    };
    if (citation.data?.scope === 'page' && typeof citation.data.sequence === 'number') {
      validatePageReference(citation, atSnapshot, sources);
      view = historical.get(citation.data.sequence);
    }
    if (citation.data?.claim) {
      const selection = readCitation(citation, atSnapshot, sources);
      ({ context, text, range } = selection.passage);
      claim = selection.claim.range;
      view = historical.get(selection.passage.range.sequence);
    } else {
      if (!view) throw new Error('Reference snapshot is unavailable');
      if (isWikiContent(source, view)) return;
      context = recordText(source, view, sources);
      text = context;
    }
    const current = snapshot.get(source.key.node);
    const changedText = () => {
      try {
        return recordText(current!, snapshot, sources) !== context;
      } catch (error) {
        // A new source format cannot invalidate the already supported historical quotation.
        if (error instanceof UnsupportedSourceRecordError) return true;
        throw error;
      }
    };
    // Descendant-only edits can change a composite's text without changing its own version.
    const state = !current?.data
      ? 'deleted'
      : current.key.transaction !== source.key.transaction || changedText()
        ? 'newer'
        : 'original';
    const author = transaction
      ? historical.get(transaction.sequence)?.get(transaction.recordedBy)
      : undefined;
    const description = view && sources.describe(source, view);
    return {
      id: citation.key.node,
      title: description?.title || String(citation.data?.text ?? 'Reference'),
      text,
      context,
      range,
      claim,
      state,
      source: source.key,
      sequence: view?.sequence ?? snapshot.sequence,
      speaker: description?.speaker,
      date: description?.date ?? transaction?.recordedAt,
      author: String(author?.data?.name ?? ''),
      href: description?.href,
    };
  };
  const metadataOf = (node: NodeVersion) => related.classifications(node.key);
  const kindOf = (node: NodeVersion) =>
    metadataOf(node).find((term) => term.predicate === 'type' && term.state !== 'deleted')?.key ||
    'page';
  const tagsOf = (node: NodeVersion) =>
    metadataOf(node)
      .filter((term) => term.predicate === 'tag' && term.state !== 'deleted')
      .map((term) => term.key);
  const candidates = pageNodes.map((page) => ({
    node: page.key.node,
    title: String(page.data?.title ?? 'Untitled page'),
    created: typeof page.data?.created === 'string' ? page.data.created : undefined,
    page,
  }));
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
              recordText(claim, snapshot, sources) !== recordText(original, view, sources)
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
      data: node.data?.kind === 'relationship' ? related.relationship(node) : node.data!,
      children:
        node.data?.kind === 'query'
          ? related.query(node, candidates).map((candidate) => ({
              id: `${node.key.node}:${candidate.node}`,
              data: { kind: 'link', text: candidate.title },
              children: [],
              href: hrefOf(candidate.page),
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
      const metadata: WikiClassification[] = [...metadataOf(node)];
      const classificationNodes = new Set(metadata.map((term) => term.relationship));
      const blocks = children
        .filter((child) => !classificationNodes.has(child.key.node) && child.data?.kind !== 'cite')
        .map((child) => blockOf(child));
      const explicit = children.filter(
        (child) => child.data?.kind === 'cite' && child.data.scope === 'page',
      );
      const links = pageReferenceLinks(node, snapshot, sources);
      const referenced = new Set(explicit.map((child) => child.connection?.target.node));
      const pageSources = [
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
        sources: pageSources,
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
          href: `/wiki/${encodeURIComponent(node.key.node)}/`,
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

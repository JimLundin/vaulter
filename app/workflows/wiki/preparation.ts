// Prepare Wiki-owned references without publishing or choosing import identities and authorship.
import { canonical } from '@/vault/nodes/json.ts';
import type { JsonObject, NodeAddress, NodeVersion } from '@/vault/nodes/model.ts';
import type { NodeChange, NodeSnapshot } from '@/vault/nodes/store.ts';
import type { SourceReader } from '@/vault/sources.ts';
import { readCitation, selectText, validatePageReference } from './citations.ts';
import { validateEvidence, type EvidenceEndpoint, type EvidencePair } from './evidence.ts';
import { pageReferenceLinks } from './references.ts';
import { parseWikiRecord } from './records.ts';

export interface ReviewedCitation extends EvidencePair {
  readonly claim: EvidenceEndpoint & { readonly quote: string };
  readonly passage: EvidenceEndpoint & { readonly quote: string };
}
export interface ReferencePreparation {
  readonly pageReferenceIdentity: (page: NodeVersion, link: NodeVersion) => string;
  readonly citationIdentity: (state: {
    readonly data: JsonObject;
    readonly source: NodeAddress;
    readonly target: NodeAddress;
  }) => string;
  readonly order: (node: string) => string;
  readonly sequenceOf: (transaction: string) => number;
  readonly citations?: readonly ReviewedCitation[];
  /** All selected Citation versions, including records unreachable through live containment. */
  readonly existingCitations: readonly NodeVersion[];
}

/** The caller must publish against exactly baselineSequence, or reprepare against its new Snapshot.
 * Descendant read expectations cover edits/removals; they cannot guard newly inserted children.
 * The generic NodeReading does not enforce this complete-baseline requirement on its own. */
export function prepareWikiReferences(
  view: NodeSnapshot,
  snapshot: (sequence: number) => NodeSnapshot,
  sources: SourceReader,
  preparation: ReferencePreparation,
) {
  if (preparation.citations)
    validateEvidence(view, snapshot, preparation.citations, preparation.existingCitations);
  const all: NodeVersion[] = [];
  const visit = (node: NodeVersion) => {
    all.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  const pages = all.filter((node) => node.data?.kind === 'page');
  const changes: NodeChange[] = [];
  const expectedReads: Record<string, string | null> = {};
  const issues: { node: string; reason: string }[] = [];
  const newCitations: { node: string; index: number }[] = [];
  const pagesWithoutReferences: string[] = [];
  let pageReferences = 0;
  let alreadyPresent = 0;
  const depend = (node: string) => {
    expectedReads[node] = view.get(node)?.key.transaction ?? null;
  };
  const add = (
    node: string,
    parent: string,
    target: NodeAddress,
    data: JsonObject,
    source: NodeAddress,
  ) => {
    const pending = changes.find((change) => change.node === node);
    const existing = view.get(node);
    const state = {
      data,
      placement: { parent, order: preparation.order(node) },
      connection: { source, target },
    };
    if (pending) {
      if (
        canonical({
          data: pending.data,
          placement: pending.placement,
          connection: pending.connection,
        }) !== canonical(state)
      )
        throw new Error('Conflicting planned citation');
      alreadyPresent++;
      return false;
    }
    if (existing) {
      if (
        canonical({
          data: existing.data,
          placement: existing.placement,
          connection: existing.connection,
        }) !== canonical(state)
      )
        throw new Error(`Enrichment identity has changed: ${node}`);
      alreadyPresent++;
      return false;
    }
    changes.push({ node, expected: null, ...state });
    depend(parent);
    return true;
  };
  for (const page of pages) {
    const unique = new Set<string>();
    const links = pageReferenceLinks(page, view, sources);
    let hasReference = false;
    for (const link of links) {
      const target = link.connection && view.resolve(link.connection.target);
      if (!target?.data) {
        issues.push({
          node: link.key.node,
          reason: link.connection ? 'Deleted source' : 'Unresolved source link',
        });
        continue;
      }
      hasReference = true;
      let endpoint = target.key;
      const signature = canonical(endpoint);
      if (unique.has(signature)) continue;
      unique.add(signature);
      const id = preparation.pageReferenceIdentity(page, link);
      const previous = view.get(id);
      if (previous?.connection)
        endpoint = {
          node: previous.connection.target.node,
          transaction: previous.connection.target.transaction!,
        };
      const sequence =
        previous?.data?.sequence ??
        (link.connection?.target.transaction
          ? preparation.sequenceOf(endpoint.transaction)
          : view.sequence);
      const data = parseWikiRecord({ kind: 'cite', scope: 'page', sequence });
      const source = { node: page.key.node };
      validatePageReference(
        {
          key: { node: id, transaction: 'planned' },
          data,
          placement: null,
          connection: { source, target: endpoint },
        },
        snapshot,
        sources,
      );
      if (add(id, page.key.node, endpoint, data, source)) pageReferences++;
      depend(link.key.node);
      if (!link.connection?.target.transaction) depend(target.key.node);
    }
    if (!hasReference) pagesWithoutReferences.push(page.key.node);
  }
  for (const [index, entry] of (preparation.citations ?? []).entries()) {
    for (const endpoint of [entry.claim, entry.passage]) {
      const selected = selectText(
        endpoint.address,
        endpoint.selection,
        snapshot(endpoint.selection.sequence),
        sources,
      );
      if (selected.text !== endpoint.quote)
        throw new Error('Reviewed quote does not match its historical selection');
    }
    const claim = view.resolve(entry.claim.address);
    if (!claim?.data || view.get(claim.key.node)?.key.transaction !== claim.key.transaction)
      throw new Error('Reviewed claim has changed; review the current statement');
    const dependTree = (node: NodeVersion) => {
      depend(node.key.node);
      for (const child of view.children(node.key.node))
        if (child.data?.kind !== 'cite') dependTree(child);
    };
    dependTree(claim);
    const current = selectText(
      entry.claim.address,
      { ...entry.claim.selection, sequence: view.sequence },
      view,
      sources,
    );
    const historical = selectText(
      entry.claim.address,
      entry.claim.selection,
      snapshot(entry.claim.selection.sequence),
      sources,
    );
    if (current.context !== historical.context)
      throw new Error('Reviewed claim descendants have changed');
    if (
      !['run', 'link', 'paragraph', 'heading', 'item', 'cell', 'code'].includes(
        String(claim.data.kind),
      )
    )
      throw new Error('Claim must select a text node or text block');
    const data = parseWikiRecord({
      kind: 'cite',
      unit: 'utf16',
      claim: entry.claim.selection,
      passage: entry.passage.selection,
    });
    const state = { data, source: entry.claim.address, target: entry.passage.address };
    const id = preparation.citationIdentity(state);
    readCitation(
      {
        key: { node: id, transaction: 'planned' },
        data,
        placement: { parent: claim.key.node, order: preparation.order(id) },
        connection: { source: state.source, target: state.target },
      },
      snapshot,
      sources,
    );
    if (add(id, claim.key.node, state.target, data, state.source))
      newCitations.push({ node: id, index });
  }
  return {
    baselineSequence: view.sequence,
    changes,
    expectedReads,
    newCitations,
    pages: pages.length,
    pageReferences,
    statementCitations: newCitations.length,
    alreadyPresent,
    pagesWithoutReferences,
    issues,
  };
}

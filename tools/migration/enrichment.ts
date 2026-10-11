// Append-only enrichment of the published node vault. Returns a reviewable commit, never writes it.
import { z } from 'zod';
import { snapshotOf } from '../../app/vault/nodes/history.ts';
import { canonical } from '../../app/vault/nodes/json.ts';
import type { NodeAddress, NodeVersion } from '../../app/vault/nodes/model.ts';
import type { NodeCommit } from '../../app/vault/nodes/store.ts';
import type { NodeRecord } from '../../app/vault/nodes/validation.ts';
import { readCitation, selectText } from '../../app/vault/records/citations.ts';
import { parseVaultRecord } from '../../app/vault/records/index.ts';
import { textSelection } from '../../app/vault/records/wiki.ts';
import { pageReferenceLinks } from '../../app/workflows/wiki/references.ts';
import { uuid } from './keys.ts';
import { validateEvidence } from './evidence.ts';

const address = z.strictObject({ node: z.string().min(1), transaction: z.string().min(1) });
const selected = z.strictObject({ address, selection: textSelection, quote: z.string().min(1) });
/** Quotes are review guards only. Persisted text is always derived from the historical endpoints. */
export const reviewedEvidence = z.strictObject({
  format: z.literal(1),
  reviewer: z.string().min(1),
  citations: z.array(
    z.strictObject({
      claim: selected,
      passage: selected,
      rationale: z.string().trim().min(1),
    }),
  ),
});
export type EvidenceReview = z.infer<typeof reviewedEvidence>;

export function planEnrichment(records: readonly NodeRecord[], input?: EvidenceReview) {
  const review = input && reviewedEvidence.parse(input);
  if (review) validateEvidence(records, review.citations);
  const view = snapshotOf(records);
  const transactions = new Map(
    records.map((record) => [record.transaction.id, record.transaction]),
  );
  const historical = new Map<number, ReturnType<typeof snapshotOf>>();
  const at = (sequence: number) => {
    let snapshot = historical.get(sequence);
    if (!snapshot) {
      snapshot = snapshotOf(records, sequence);
      historical.set(sequence, snapshot);
    }
    return snapshot;
  };
  const all: NodeVersion[] = [];
  const visit = (node: NodeVersion) => {
    all.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  const pages = all.filter((node) => node.data?.kind === 'page');
  const changes: NodeCommit['changes'][number][] = [];
  const expectedReads: Record<string, string | null> = {};
  const rationales: Record<string, string> = {};
  const issues: { node: string; reason: string }[] = [];
  let pageReferences = 0;
  let citations = 0;
  let alreadyPresent = 0;
  const pagesWithoutReferences: string[] = [];
  const depend = (node: string) => {
    expectedReads[node] = view.get(node)?.key.transaction ?? null;
  };
  const add = (
    node: string,
    parent: string,
    target: NodeAddress,
    data: NodeVersion['data'],
    source: NodeAddress,
  ) => {
    const pending = changes.find((change) => change.node === node);
    const existing = view.get(node);
    const state = {
      data,
      placement: { parent, order: `z${node}` },
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
    for (const link of pageReferenceLinks(page, view)) {
      const target = link.connection && view.resolve(link.connection.target);
      if (!target?.data) {
        issues.push({
          node: link.key.node,
          reason: link.connection ? 'Deleted source' : 'Unresolved source link',
        });
        continue;
      }
      let endpoint = target.key;
      const signature = canonical(endpoint);
      if (unique.has(signature)) continue;
      unique.add(signature);
      // A retained link version anchors the initial association; retrying does not select a later snapshot.
      const id = uuid(
        `wiki-page-reference/v1:${page.key.node}:${link.key.node}:${link.key.transaction}`,
      );
      const previous = view.get(id);
      if (previous?.connection)
        endpoint = {
          node: previous.connection.target.node,
          transaction: previous.connection.target.transaction!,
        };
      const sequence =
        previous?.data?.sequence ??
        (link.connection?.target.transaction
          ? transactions.get(endpoint.transaction)!.sequence
          : view.sequence);
      const data = parseVaultRecord({ kind: 'cite', scope: 'page', sequence });
      if (add(id, page.key.node, endpoint, data, { node: page.key.node })) pageReferences++;
      depend(link.key.node);
      if (!link.connection?.target.transaction) depend(target.key.node);
    }
  }
  if (review) {
    const reviewer = view.get(review.reviewer);
    if (!(reviewer?.data && ['actor', 'agent'].includes(String(reviewer.data.kind))))
      throw new Error('Evidence reviewer must be a live actor or agent');
    depend(review.reviewer);
    for (const entry of review.citations) {
      for (const endpoint of [entry.claim, entry.passage]) {
        const selectedText = selectText(
          endpoint.address,
          endpoint.selection,
          at(endpoint.selection.sequence),
        );
        if (selectedText.text !== endpoint.quote)
          throw new Error('Reviewed quote does not match its historical selection');
      }
      const claim = view.resolve(entry.claim.address);
      if (!claim?.data || view.get(claim.key.node)?.key.transaction !== claim.key.transaction)
        throw new Error('Reviewed claim has changed; review the current statement');
      // Composite edits require guarding all descendant reads, not only the container's version.
      const dependTree = (node: NodeVersion) => {
        depend(node.key.node);
        for (const child of view.children(node.key.node))
          if (child.data?.kind !== 'cite') dependTree(child);
      };
      dependTree(claim);
      const currentClaim = selectText(
        entry.claim.address,
        { ...entry.claim.selection, sequence: view.sequence },
        view,
      );
      const historicalClaim = selectText(
        entry.claim.address,
        entry.claim.selection,
        at(entry.claim.selection.sequence),
      );
      if (currentClaim.context !== historicalClaim.context)
        throw new Error('Reviewed claim descendants have changed');
      const data = parseVaultRecord({
        kind: 'cite',
        unit: 'utf16',
        claim: entry.claim.selection,
        passage: entry.passage.selection,
      });
      const id = uuid(
        `wiki-statement-citation/v1:${canonical({ data, source: entry.claim.address, target: entry.passage.address })}`,
      );
      const allowed = ['run', 'link', 'paragraph', 'heading', 'item', 'cell', 'code'];
      if (!allowed.includes(String(claim.data.kind)))
        throw new Error('Claim must select a text node or text block');
      if (add(id, claim.key.node, entry.passage.address, data, entry.claim.address)) {
        readCitation(
          {
            key: { node: id, transaction: 'planned' },
            data,
            placement: { parent: claim.key.node, order: 'z' },
            connection: { source: entry.claim.address, target: entry.passage.address },
          },
          at,
        );
        rationales[id] = entry.rationale;
        citations++;
      }
    }
  }
  for (const node of all) {
    if (node.data?.kind === 'relationship' && !node.connection)
      issues.push({ node: node.key.node, reason: 'Unresolved relationship retained' });
  }
  for (const page of pages) {
    if (
      !pageReferenceLinks(page, view).some(
        (link) => link.connection && view.resolve(link.connection.target)?.data,
      )
    )
      pagesWithoutReferences.push(page.key.node);
  }
  const author = review?.reviewer ?? uuid('wiki-enrichment/v1:author');
  if (changes.length && !view.get(author)) {
    changes.unshift({
      node: author,
      expected: null,
      data: parseVaultRecord({ kind: 'agent', name: 'Wiki migration' }),
      placement: null,
      connection: null,
    });
  }
  const draft = {
    recordedBy: author,
    origin: null,
    undoOf: null,
    kind: { scope: 'node', action: 'create' } as const,
    message: 'Enrich Wiki page references and reviewed statement citations',
    metadata: { migration: 'wiki-enrichment/v1', rationales },
    expectedReads,
    changes: changes.sort((a, b) => a.node.localeCompare(b.node)),
  };
  const request: NodeCommit | null = changes.length
    ? { id: `wiki-enrichment:${uuid(canonical(draft))}`, ...draft }
    : null;
  const withSources = pages.filter((page) =>
    pageReferenceLinks(page, view).some(
      (link) => link.connection && view.resolve(link.connection.target)?.data,
    ),
  ).length;
  return {
    request,
    report: {
      baselineTransactions: records.length,
      pages: pages.length,
      pagesWithReferences: withSources,
      pagesWithoutReferences: pages.length - withSources,
      reviewQueue: { pagesWithoutReferences },
      pageReferences,
      statementCitations: citations,
      alreadyPresent,
      classifications: all.filter(
        (node) =>
          node.data?.kind === 'relationship' &&
          ['type', 'tag'].includes(String(node.data.predicate)),
      ).length,
      issues,
    },
  };
}

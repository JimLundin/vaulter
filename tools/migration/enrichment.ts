// Migration retains deterministic identities, trusted review attribution and append-only reports.
import { z } from 'zod';
import { snapshotOf } from '../../app/vault/nodes/history.ts';
import { canonical } from '../../app/vault/nodes/json.ts';
import type { NodeVersion } from '../../app/vault/nodes/model.ts';
import type { NodeCommit } from '../../app/vault/nodes/store.ts';
import type { NodeRecord } from '../../app/vault/nodes/validation.ts';
import { prepareWikiReferences } from '../../app/workflows/wiki/preparation.ts';
import { textSelection } from '../../app/workflows/wiki/records.ts';
import { uuid } from './keys.ts';
import { migrationSources, parseMigrationRecord, selectedCitations } from './wiki.ts';

const address = z.strictObject({ node: z.string().min(1), transaction: z.string().min(1) });
const selected = z.strictObject({ address, selection: textSelection, quote: z.string().min(1) });
/** Quotes are review guards only. Persisted text derives from the historical endpoints. */
export const reviewedEvidence = z.strictObject({
  format: z.literal(1),
  reviewer: z.string().min(1),
  citations: z.array(
    z.strictObject({ claim: selected, passage: selected, rationale: z.string().trim().min(1) }),
  ),
});
export type EvidenceReview = z.infer<typeof reviewedEvidence>;

export function planEnrichment(records: readonly NodeRecord[], input?: EvidenceReview) {
  const review = input && reviewedEvidence.parse(input);
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
  if (review) {
    const reviewer = view.get(review.reviewer);
    if (!(reviewer?.data && ['actor', 'agent'].includes(String(reviewer.data.kind))))
      throw new Error('Evidence reviewer must be a live actor or agent');
  }
  const prepared = prepareWikiReferences(view, at, migrationSources, {
    pageReferenceIdentity: (page, link) =>
      uuid(`wiki-page-reference/v1:${page.key.node}:${link.key.node}:${link.key.transaction}`),
    citationIdentity: (state) => uuid(`wiki-statement-citation/v1:${canonical(state)}`),
    order: (node) => `z${node}`,
    sequenceOf: (transaction) => {
      const recorded = transactions.get(transaction);
      if (!recorded) throw new Error('Reference transaction is unavailable');
      return recorded.sequence;
    },
    citations: review?.citations,
    existingCitations: selectedCitations(records, view),
  });
  const { changes, expectedReads } = prepared;
  if (review) expectedReads[review.reviewer] = view.get(review.reviewer)!.key.transaction;
  const rationales: Record<string, string> = {};
  for (const citation of prepared.newCitations)
    rationales[citation.node] = review!.citations[citation.index]!.rationale;
  const all: NodeVersion[] = [];
  const visit = (node: NodeVersion) => {
    all.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  const issues = [...prepared.issues];
  for (const node of all)
    if (node.data?.kind === 'relationship' && !node.connection)
      issues.push({ node: node.key.node, reason: 'Unresolved relationship retained' });
  const author = review?.reviewer ?? uuid('wiki-enrichment/v1:author');
  if (changes.length && !view.get(author))
    changes.unshift({
      node: author,
      expected: null,
      data: parseMigrationRecord({ kind: 'agent', name: 'Wiki migration' }),
      placement: null,
      connection: null,
    });
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
  return {
    // Publication must retain this exact prefix; generic expectedReads do not guard insertions.
    baselineSequence: prepared.baselineSequence,
    request,
    report: {
      baselineTransactions: records.length,
      pages: prepared.pages,
      pagesWithReferences: prepared.pages - prepared.pagesWithoutReferences.length,
      pagesWithoutReferences: prepared.pagesWithoutReferences.length,
      reviewQueue: { pagesWithoutReferences: prepared.pagesWithoutReferences },
      pageReferences: prepared.pageReferences,
      statementCitations: prepared.statementCitations,
      alreadyPresent: prepared.alreadyPresent,
      classifications: all.filter(
        (node) =>
          node.data?.kind === 'relationship' &&
          ['type', 'tag'].includes(String(node.data.predicate)),
      ).length,
      issues,
    },
  };
}

import { expect, test } from 'vitest';
import { accept, snapshotOf } from '../../app/vault/nodes/history.ts';
import { digest } from '../../app/vault/nodes/json.ts';
import { create, request } from '../../app/vault/nodes/fixtures.test-support.ts';
import type { NodeChange } from '../../app/vault/nodes/store.ts';
import type { NodeRecord } from '../../app/vault/nodes/validation.ts';
import { readCitation } from '../../app/workflows/wiki/citations.ts';
import { recordText } from '../../app/workflows/wiki/text.ts';
import { migrationSources } from './wiki.ts';
import { planEnrichment, type EvidenceReview } from './enrichment.ts';

async function fixture() {
  const connected = (id: string, parent: string, target: string) => ({
    ...create(id, { kind: 'link', text: id }, parent),
    connection: { source: { node: parent }, target: { node: target } },
  });
  const seed = request('seed', [
    create('user', { kind: 'actor', name: 'Reviewer' }),
    create('page', { kind: 'page', title: 'Studio' }),
    create('claim', { kind: 'paragraph' }, 'page'),
    {
      ...create('one', { kind: 'run', text: 'Keep ' }, 'claim'),
      placement: { parent: 'claim', order: 'a' },
    },
    {
      ...create('two', { kind: 'run', text: 'mornings free.', marks: ['strong'] }, 'claim'),
      placement: { parent: 'claim', order: 'b' },
    },
    create('source', { kind: 'exchange', preamble: 'Original plan' }),
    create('passage', { kind: 'paragraph' }, 'source'),
    create('words', { kind: 'run', text: 'Schedule: Keep mornings free. Later work.' }, 'passage'),
    create('second', { kind: 'paragraph' }),
    create('secondWords', { kind: 'run', text: 'Keep mornings free.' }, 'second'),
    create('web', { kind: 'resource', url: 'https://example.com/reference' }),
    create('ordinary', { kind: 'resource', url: 'https://example.com/background' }),
    { ...connected('body-link', 'claim', 'ordinary'), placement: { parent: 'claim', order: 'c' } },
    create('refs', { kind: 'section' }, 'page'),
    {
      ...create('heading', { kind: 'heading' }, 'refs'),
      placement: { parent: 'refs', order: 'a' },
    },
    create('heading-words', { kind: 'run', text: 'References' }, 'heading'),
    {
      ...create('ref-paragraph', { kind: 'paragraph' }, 'refs'),
      placement: { parent: 'refs', order: 'b' },
    },
    connected('source-link', 'ref-paragraph', 'web'),
    create('chat', { kind: 'conversation', title: 'Planning' }),
    create('exchange', { kind: 'exchange' }, 'chat'),
    create('message', { kind: 'message', text: 'Quiet mornings.' }, 'exchange'),
    connected('capture-link', 'ref-paragraph', 'exchange'),
    create('term', { kind: 'term', scheme: 'area', key: 'work', label: 'Work' }),
    {
      ...create('tag', { kind: 'relationship', predicate: 'tag' }, 'page'),
      connection: { source: { node: 'page' }, target: { node: 'term' } },
    },
    create('missing', { kind: 'relationship', predicate: 'where', label: 'Unknown place' }, 'page'),
  ]);
  const records = [accept([], seed, await digest(seed), '2026-10-11T10:00:00Z')];
  // The ordinary body link is visible text, deliberately excluded from the selected claim range.
  const claim = {
    address: { node: 'claim', transaction: 'seed' },
    selection: { sequence: 1, start: 0, end: 19 },
    quote: 'Keep mornings free.',
  };
  const review: EvidenceReview = {
    format: 1,
    reviewer: 'user',
    citations: [
      {
        claim,
        passage: {
          address: { node: 'passage', transaction: 'seed' },
          selection: { sequence: 1, start: 10, end: 29 },
          quote: 'Keep mornings free.',
        },
        rationale: 'Original schedule states this requirement.',
      },
      {
        claim,
        passage: {
          address: { node: 'second', transaction: 'seed' },
          selection: { sequence: 1, start: 0, end: 19 },
          quote: 'Keep mornings free.',
        },
        rationale: 'Independent confirmation of the same requirement.',
      },
    ],
  };
  return { records, review };
}
async function append(records: readonly NodeRecord[], id: string, changes: NodeChange[]) {
  const commit = request(id, changes);
  return [...records, accept(records, commit, await digest(commit), '2026-10-11T11:00:00Z')];
}

test('enrichment appends references and multiple reviewed sources without changing old identities or prose', async () => {
  const { records, review } = await fixture();
  const plan = planEnrichment(records, review);
  expect(plan.report).toMatchObject({ pageReferences: 2, statementCitations: 2 });
  expect(plan.report.issues).toContainEqual({
    node: 'missing',
    reason: 'Unresolved relationship retained',
  });
  const commit = plan.request!;
  // Published migration retry identities must survive relocation of Wiki-owned rules.
  expect(commit.id).toBe('wiki-enrichment:c98e6f7d-6250-8816-98b9-790fd5062a3f');
  const enriched = [
    ...records,
    accept(records, commit, await digest(commit), '2026-10-11T10:30:00Z'),
  ];
  const before = snapshotOf(records);
  const after = snapshotOf(enriched);
  expect(recordText(after.get('page')!, after, migrationSources)).toBe(
    recordText(before.get('page')!, before, migrationSources),
  );
  for (const original of records[0].versions) expect(after.get(original.key.node)).toBe(original);
  const citations = after.children('claim').filter((node) => node.data?.kind === 'cite');
  expect(citations).toHaveLength(2);
  for (const citation of citations) {
    expect(
      readCitation(citation, (sequence) => snapshotOf(enriched, sequence), migrationSources).passage
        .text,
    ).toBe('Keep mornings free.');
    expect(citation.data).not.toHaveProperty('quote');
  }
  expect(planEnrichment(enriched, review).request).toBeNull();
  // A later source edit cannot cause retrying the migration to capture a different version.
  const web = after.get('web')!;
  const changed = await append(enriched, 'new-web', [
    {
      node: 'web',
      expected: web.key.transaction,
      placement: web.placement,
      connection: web.connection,
      data: { kind: 'resource', url: 'https://example.com/changed' },
    },
  ]);
  expect(planEnrichment(changed, review).request).toBeNull();
});

test('reviews fail closed on mismatched quotes, deleted or changed claims and composite descendant edits', async () => {
  const { records, review } = await fixture();
  expect(() =>
    planEnrichment(records, {
      ...review,
      citations: [
        {
          ...review.citations[0],
          passage: { ...review.citations[0].passage, quote: 'Invented support' },
        },
      ],
    }),
  ).toThrow('Reviewed quote');
  const words = snapshotOf(records).get('two')!;
  const changed = await append(records, 'edit', [
    {
      node: 'two',
      expected: words.key.transaction,
      placement: words.placement,
      connection: null,
      data: { kind: 'run', text: 'afternoons free.' },
    },
  ]);
  expect(() => planEnrichment(changed, review)).toThrow('descendants have changed');
  const claim = snapshotOf(records).get('claim')!;
  const removed = await append(records, 'remove', [
    {
      node: 'claim',
      expected: claim.key.transaction,
      placement: null,
      connection: null,
      data: null,
    },
  ]);
  expect(() => planEnrichment(removed, review)).toThrow('claim has changed');
});

test('a composite source selection freezes the reviewed snapshot after descendant-only edits', async () => {
  const { records, review } = await fixture();
  const words = snapshotOf(records).get('words')!;
  const changed = await append(records, 'source-edit', [
    {
      node: 'words',
      expected: 'seed',
      placement: words.placement,
      connection: null,
      data: { kind: 'run', text: 'Updated: Keep mornings free. Confirmed.' },
    },
  ]);
  const entry = {
    ...review.citations[0],
    passage: {
      address: { node: 'passage', transaction: 'seed' },
      selection: { sequence: 2, start: 9, end: 28 },
      quote: 'Keep mornings free.',
    },
  };
  const plan = planEnrichment(changed, { ...review, citations: [entry, entry] });
  expect(plan.report.statementCitations).toBe(1);
  const commit = plan.request!;
  const enriched = [
    ...changed,
    accept(changed, commit, await digest(commit), '2026-10-11T12:00:00Z'),
  ];
  const citation = snapshotOf(enriched)
    .children('claim')
    .find((node) => node.data?.claim)!;
  const selected = readCitation(
    citation,
    (sequence) => snapshotOf(enriched, sequence),
    migrationSources,
  );
  expect(selected.passage.context).toBe('Updated: Keep mornings free. Confirmed.');
  expect(selected.passage.node.key.transaction).toBe('seed');
  expect(planEnrichment(enriched, { ...review, citations: [entry] }).request).toBeNull();
});

test('direct enrichment rejects Wiki source paragraphs and retains source-page links as navigation', async () => {
  const { records, review } = await fixture();
  const changed = await append(records, 'wiki-source', [
    create('summary-page', { kind: 'page', title: 'Summary' }),
    create('summary', { kind: 'paragraph' }, 'summary-page'),
    create('summary-words', { kind: 'run', text: 'Keep mornings free.' }, 'summary'),
    {
      ...create('wiki-source-link', { kind: 'relationship', predicate: 'source' }, 'page'),
      connection: { source: { node: 'page' }, target: { node: 'summary-page' } },
    },
  ]);
  expect(planEnrichment(changed).report.pageReferences).toBe(2);
  expect(() =>
    planEnrichment(changed, {
      ...review,
      citations: [
        {
          ...review.citations[0],
          passage: {
            address: { node: 'summary', transaction: 'wiki-source' },
            selection: { sequence: 2, start: 0, end: 19 },
            quote: 'Keep mornings free.',
          },
        },
      ],
    }),
  ).toThrow('Wiki content');
});

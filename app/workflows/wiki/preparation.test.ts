import { expect, test } from 'vitest';
import { create, request } from '../../vault/nodes/fixtures.test-support.ts';
import { accept, snapshotOf } from '../../vault/nodes/history.ts';
import { digest } from '../../vault/nodes/json.ts';
import type { NodeChange, NodeSnapshot } from '../../vault/nodes/store.ts';
import type { NodeRecord } from '../../vault/nodes/validation.ts';
import type { SourceReader } from '../../vault/sources.ts';
import {
  prepareWikiReferences,
  type ReferencePreparation,
  type ReviewedCitation,
} from './preparation.ts';

const sources: SourceReader = {
  text: (node, { view, textOf }) => {
    if (node.data?.kind !== 'retained') return;
    return view.children(node.key).map(textOf).join('\n');
  },
  describe: (node) => (node.data?.kind === 'retained' ? { title: 'Retained source' } : undefined),
};
const identities: Omit<ReferencePreparation, 'existingCitations' | 'citations'> = {
  pageReferenceIdentity: (_page, link) => `reference:${link.key.node}`,
  citationIdentity: (state) => `citation:${state.source.node}:${state.target.node}`,
  order: (node) => `z${node}`,
  sequenceOf: () => 1,
};
const citation: ReviewedCitation = {
  claim: {
    address: { node: 'claim', transaction: 'seed' },
    selection: { sequence: 1, start: 0, end: 19 },
    quote: 'Keep mornings free.',
  },
  passage: {
    address: { node: 'source-block', transaction: 'seed' },
    selection: { sequence: 1, start: 0, end: 19 },
    quote: 'Keep mornings free.',
  },
};
async function fixture() {
  const commit = request('seed', [
    create('user', { kind: 'actor', name: 'Reviewer' }),
    create('page', { kind: 'page', title: 'Studio' }),
    create('claim', { kind: 'paragraph' }, 'page'),
    create('claim-run', { kind: 'run', text: 'Keep mornings free.' }, 'claim'),
    create('source', { kind: 'retained' }),
    create('source-block', { kind: 'paragraph' }, 'source'),
    create('source-run', { kind: 'run', text: 'Keep mornings free.' }, 'source-block'),
    {
      ...create('source-link', { kind: 'relationship', predicate: 'source' }, 'page'),
      connection: { source: { node: 'page' }, target: { node: 'source' } },
    },
  ]);
  return [accept([], commit, await digest(commit), '2026-10-11T10:00:00Z')];
}
async function append(records: readonly NodeRecord[], changes: readonly NodeChange[]) {
  const commit = request('edit', changes);
  return [...records, accept(records, commit, await digest(commit), '2026-10-11T11:00:00Z')];
}
function prepare(
  records: readonly NodeRecord[],
  citations: readonly ReviewedCitation[] = [citation],
  snapshot?: (sequence: number) => NodeSnapshot,
) {
  return prepareWikiReferences(
    snapshotOf(records),
    snapshot ?? ((sequence) => snapshotOf(records, sequence)),
    sources,
    { ...identities, citations, existingCitations: records.flatMap((record) => record.versions) },
  );
}

test('Wiki prepares Page references and Citation shapes with read expectations without publishing', async () => {
  const records = await fixture();
  const prepared = prepare(records);
  expect(prepared).toMatchObject({
    baselineSequence: 1,
    pageReferences: 1,
    statementCitations: 1,
    pagesWithoutReferences: [],
    newCitations: [{ node: 'citation:claim:source-block', index: 0 }],
  });
  expect(prepared.expectedReads).toEqual({
    page: 'seed',
    'source-link': 'seed',
    source: 'seed',
    claim: 'seed',
    'claim-run': 'seed',
  });
  expect(prepared.changes).toContainEqual({
    node: 'reference:source-link',
    expected: null,
    data: { kind: 'cite', scope: 'page', sequence: 1 },
    placement: { parent: 'page', order: 'zreference:source-link' },
    connection: { source: { node: 'page' }, target: { node: 'source', transaction: 'seed' } },
  });
  expect(records).toHaveLength(1);
  expect(snapshotOf(records).children('claim')).toHaveLength(1);
});

test('Wiki rejects mismatched historical snapshots, quoted text and split UTF-16 ranges', async () => {
  const records = await fixture();
  const changed = await append(records, [create('emoji', { kind: 'run', text: '😀 plan' })]);
  expect(() => prepare(changed, [citation], () => snapshotOf(changed))).toThrow(
    'snapshot does not match',
  );
  expect(() =>
    prepare(records, [{ ...citation, passage: { ...citation.passage, quote: 'Invented source' } }]),
  ).toThrow('Reviewed quote');
  expect(() =>
    prepare(changed, [
      {
        ...citation,
        passage: {
          address: { node: 'emoji', transaction: 'edit' },
          selection: { sequence: 2, start: 1, end: 3 },
          quote: 'x',
        },
      },
    ]),
  ).toThrow('surrogate');
});

test('Wiki rejects edited claims, descendant edits and newly inserted claim fragments on reprepare', async () => {
  const records = await fixture();
  const editedClaim = await append(records, [
    { ...create('claim', { kind: 'paragraph' }, 'page'), expected: 'seed' },
  ]);
  expect(() => prepare(editedClaim)).toThrow('claim has changed');
  const editedRun = await append(records, [
    {
      ...create('claim-run', { kind: 'run', text: 'Keep afternoons free.' }, 'claim'),
      expected: 'seed',
    },
  ]);
  expect(() => prepare(editedRun)).toThrow('descendants have changed');
  const inserted = await append(records, [
    create('new-run', { kind: 'run', text: 'Extra words.' }, 'claim'),
  ]);
  expect(() => prepare(inserted)).toThrow('descendants have changed');
});

test('Wiki rejects source-owned claim containers and Wiki-owned evidence passages', async () => {
  const records = await fixture();
  expect(() =>
    prepare(records, [
      {
        ...citation,
        claim: { ...citation.claim, address: { node: 'source', transaction: 'seed' } },
      },
    ]),
  ).toThrow('Claim must select');
  expect(() => prepare(records, [{ ...citation, passage: citation.claim }])).toThrow(
    'Wiki content',
  );
});

test('Wiki validates an existing Page reference in its retained exact Snapshot before accepting a retry', async () => {
  const records = await fixture();
  const invalid = await append(records, [
    {
      ...create('reference:source-link', { kind: 'cite', scope: 'page', sequence: 2 }, 'page'),
      connection: { source: { node: 'page' }, target: { node: 'source', transaction: 'seed' } },
    },
    { ...create('source', { kind: 'retained' }), expected: 'seed' },
  ]);
  expect(() => prepare(invalid, [])).toThrow('Page reference snapshot does not select');
});

test('Wiki rejects a newer Snapshot supplied for a Page reference with unchanged root version', async () => {
  const records = await fixture();
  const reference = prepare(records, []).changes;
  const changed = await append(records, reference);
  expect(() => prepare(changed, [], () => snapshotOf(changed))).toThrow('snapshot does not match');
});

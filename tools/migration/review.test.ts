import { expect, test } from 'vitest';
import { create, request } from '../../app/vault/nodes/fixtures.test-support.ts';
import { accept } from '../../app/vault/nodes/history.ts';
import { digest } from '../../app/vault/nodes/json.ts';
import { compileReviews, prepareReviews, type AgentReview, type ReviewPacket } from './review.ts';

async function fixture() {
  const commit = request('seed', [
    create('user', { kind: 'actor', name: 'Reviewer' }),
    create('page', { kind: 'page', title: 'Studio' }),
    create('claim', { kind: 'paragraph' }, 'page'),
    create(
      'claim-words',
      { kind: 'run', text: 'The studio keeps quiet mornings free for planning.' },
      'claim',
    ),
    create('source', { kind: 'page', title: 'Original schedule' }),
    create('capture', { kind: 'exchange' }),
    create(
      'passage',
      {
        kind: 'message',
        role: 'user',
        text: 'Original schedule: The studio keeps quiet mornings free for planning.',
      },
      'capture',
    ),
    {
      ...create('capture-link', { kind: 'link', text: 'Original capture' }, 'source'),
      connection: { source: { node: 'source' }, target: { node: 'capture' } },
    },
    {
      ...create('link', { kind: 'link', text: 'Schedule' }, 'claim'),
      connection: { source: { node: 'claim' }, target: { node: 'source' } },
    },
    create('resource', { kind: 'resource', url: 'https://example.com' }),
    {
      ...create('source-link', { kind: 'relationship', predicate: 'source' }, 'page'),
      connection: { source: { node: 'page' }, target: { node: 'resource' } },
    },
    create('unrelated', { kind: 'page', title: 'Other' }),
    create('unrelated-paragraph', { kind: 'paragraph' }, 'unrelated'),
    create(
      'unrelated-words',
      { kind: 'run', text: 'Different topic about forests and rivers with seasonal rain.' },
      'unrelated-paragraph',
    ),
  ]);
  return [accept([], commit, await digest(commit), '2026-10-11T12:00:00Z')];
}

test('retrieval follows structural sources but does not turn lexical overlap into citations', async () => {
  const records = await fixture();
  const packets = prepareReviews(records);
  expect(packets).toHaveLength(3);
  const packet = packets.find((entry) => entry.page === 'page')!;
  expect(packet.unavailableSources).toBe(1);
  expect(packet.blocks[0].candidates).toHaveLength(1);
  expect(packet.blocks[0].candidates[0]).toMatchObject({
    address: { node: 'passage', transaction: 'seed' },
    association: 'capture referenced by a linked page; verify subject and entailment',
    sequence: 1,
  });
  expect(
    compileReviews(
      records,
      packets,
      [{ page: 'page', citations: [], rejected: 'Not enough support.' }],
      'user',
    ).citations,
  ).toEqual([]);
});

test('retrieval reads Resource and independently owned Content sources through their owners', async () => {
  const records = await fixture();
  const commit = request('retained-sources', [
    create('resource-paragraph', { kind: 'paragraph' }, 'resource'),
    create(
      'resource-words',
      { kind: 'run', text: 'The studio keeps quiet mornings free for planning.' },
      'resource-paragraph',
    ),
    create('report', {
      kind: 'content',
      title: 'Planning report',
      text: 'The studio keeps quiet mornings free for planning.',
    }),
    {
      ...create('report-link', { kind: 'relationship', predicate: 'source' }, 'page'),
      connection: { source: { node: 'page' }, target: { node: 'report' } },
    },
  ]);
  const retained = [
    ...records,
    accept(records, commit, await digest(commit), '2026-10-11T13:00:00Z'),
  ];
  const packet = prepareReviews(retained).find((entry) => entry.page === 'page')!;
  expect(packet.unavailableSources).toBe(0);
  const { candidates } = packet.blocks[0];
  expect(candidates).toContainEqual(
    expect.objectContaining({
      address: { node: 'resource-paragraph', transaction: 'retained-sources' },
      title: 'https://example.com',
      sequence: 2,
    }),
  );
  expect(candidates).toContainEqual(
    expect.objectContaining({
      address: { node: 'report', transaction: 'retained-sources' },
      title: 'Planning report',
      kind: 'capture',
      sequence: 2,
    }),
  );
  const selected = candidates.findIndex((candidate) => candidate.address.node === 'report');
  const compiled = compileReviews(
    retained,
    [packet],
    [
      {
        page: 'page',
        rejected: 'Other passages omitted.',
        citations: [
          {
            claim: 'claim',
            claimQuote: 'quiet mornings',
            candidate: selected,
            passageQuote: 'quiet mornings',
            rationale: 'The independently retained report supports the statement.',
          },
        ],
      },
    ],
    'user',
  );
  expect(compiled.citations[0].passage.address.node).toBe('report');
});

test('agent verbatim selections compile into exact UTF-16 selections and reject fabricated candidates', async () => {
  const records = await fixture();
  const packets = prepareReviews(records);
  const decision: AgentReview = {
    page: 'page',
    rejected: 'Remaining material is unrelated.',
    citations: [
      {
        claim: 'claim',
        claimQuote: 'keeps quiet mornings free for planning.',
        candidate: 0,
        passageQuote: 'The studio keeps quiet mornings free for planning.',
        rationale: 'Original user message explicitly states this requirement for the same studio.',
      },
    ],
  };
  const review = compileReviews(records, packets, [decision], 'user');
  expect(review.citations[0]).toMatchObject({
    claim: {
      address: { node: 'claim', transaction: 'seed' },
      selection: { sequence: 1, start: 11, end: 50 },
    },
    passage: {
      address: { node: 'passage', transaction: 'seed' },
      selection: { sequence: 1, start: 19, end: 69 },
    },
  });
  expect(() =>
    compileReviews(
      records,
      packets,
      [{ ...decision, citations: [{ ...decision.citations[0], claimQuote: 'invented fact' }] }],
      'user',
    ),
  ).toThrow('missing or ambiguous');
  expect(() =>
    compileReviews(
      records,
      packets,
      [{ ...decision, citations: [{ ...decision.citations[0], candidate: 9 }] }],
      'user',
    ),
  ).toThrow('Unknown');
  expect(() => compileReviews(records, packets, [decision, decision], 'user')).toThrow('Duplicate');
  const stale = packets.map((packet) => ({ ...packet, sequence: 2 }));
  expect(() => compileReviews(records, stale, [decision], 'user')).toThrow('stale');
});

test('message chunk offsets are preserved and tampered packet text cannot be accepted', async () => {
  const records = await fixture();
  const packets = prepareReviews(records);
  const packet = packets.find((entry) => entry.page === 'page')!;
  const decision: AgentReview = {
    page: 'page',
    rejected: 'Other fragments omitted.',
    citations: [
      {
        claim: 'claim',
        claimQuote: 'quiet mornings',
        candidate: 0,
        passageQuote: 'quiet mornings',
        rationale: 'Original message supports this fragment.',
      },
    ],
  };
  const altered: ReviewPacket = {
    ...packet,
    blocks: packet.blocks.map((block) => ({
      ...block,
      candidates: block.candidates.map((candidate) => ({ ...candidate, start: 1 })),
    })),
  };
  expect(() => compileReviews(records, [altered], [decision], 'user')).toThrow('differs');
});

test('compilation rejects a Wiki passage even when supplied as a fabricated message candidate', async () => {
  const records = await fixture();
  const packets = prepareReviews(records);
  const original = packets.find((packet) => packet.page === 'page')!;
  const forged: ReviewPacket = {
    ...original,
    blocks: original.blocks.map((block) => ({
      ...block,
      candidates: [
        {
          address: { node: 'unrelated-paragraph', transaction: 'seed' },
          sequence: 1,
          title: 'Other',
          kind: 'message',
          start: 0,
          text: 'Different topic about forests and rivers with seasonal rain.',
          association: 'Fabricated classification',
        },
      ],
    })),
  };
  expect(() =>
    compileReviews(
      records,
      [forged],
      [
        {
          page: 'page',
          rejected: 'Other material omitted.',
          citations: [
            {
              claim: 'claim',
              claimQuote: 'quiet mornings',
              candidate: 0,
              passageQuote: 'forests and rivers',
              rationale: 'Unsupported Wiki restatement.',
            },
          ],
        },
      ],
      'user',
    ),
  ).toThrow('Wiki content');
});

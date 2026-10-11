import { expect, test } from 'vitest';
import { create, request } from '../../app/vault/nodes/fixtures.test-support.ts';
import { accept } from '../../app/vault/nodes/history.ts';
import { digest } from '../../app/vault/nodes/json.ts';
import { auditEvidence, validateEvidence, type EvidencePair } from './evidence.ts';

async function fixture() {
  const commit = request('seed', [
    create('user', { kind: 'actor', name: 'Reviewer' }),
    ...['a', 'b', 'c'].flatMap((id) => [
      create(`page-${id}`, { kind: 'page', title: id }),
      create(id, { kind: 'paragraph' }),
      create(`run-${id}`, { kind: 'run', text: 'The studio reserves mornings for planning.' }, id),
    ]),
    create('message', { kind: 'message', role: 'user', text: 'I reserve mornings for planning.' }),
  ]);
  return [accept([], commit, await digest(commit), '2026-10-11T12:00:00Z')];
}
const endpoint = (node: string) => ({
  address: { node, transaction: 'seed' },
  selection: { sequence: 1, start: 0, end: 10 },
});
const pair = (claim: string, passage: string): EvidencePair => ({
  claim: endpoint(claim),
  passage: endpoint(passage),
});

test('multiple statements can reach a shared independent source without a cycle', async () => {
  const records = await fixture();
  const pairs = [pair('a', 'b'), pair('a', 'message'), pair('b', 'message')];
  expect(auditEvidence(records, pairs)).toEqual({ wikiSources: [], self: [], circular: [] });
  expect(() => validateEvidence(records, pairs)).not.toThrow();
});

test('reciprocal and longer chains cannot manufacture supporting evidence', async () => {
  const records = await fixture();
  expect(auditEvidence(records, [pair('a', 'b'), pair('b', 'a')]).circular).toEqual([0, 1]);
  const pairs = [pair('a', 'b'), pair('b', 'c'), pair('c', 'a'), pair('c', 'message')];
  expect(auditEvidence(records, pairs).circular).toEqual([0, 1, 2]);
  expect(() => validateEvidence(records, pairs)).toThrow('Circular');
});

test('inline and container addresses cannot hide self citations or reciprocal evidence', async () => {
  const records = await fixture();
  expect(() => validateEvidence(records, [pair('run-a', 'a')])).toThrow('own page');
  expect(auditEvidence(records, [pair('run-a', 'b'), pair('run-b', 'a')]).circular).toEqual([0, 1]);
});

test('a later review cannot close a chain through an already accepted citation', async () => {
  const records = await fixture();
  const commit = request('cite', [
    {
      ...create(
        'citation',
        {
          kind: 'cite',
          unit: 'utf16',
          claim: endpoint('a').selection,
          passage: endpoint('b').selection,
        },
        'a',
      ),
      connection: { source: endpoint('a').address, target: endpoint('b').address },
    },
  ]);
  const next = accept(records, commit, await digest(commit), '2026-10-11T12:01:00Z');
  expect(() => validateEvidence([...records, next], [pair('b', 'a')])).toThrow('Circular');
  expect(() => validateEvidence([...records, next], [pair('b', 'message')])).not.toThrow();
});

test('source eligibility follows historical placement for pages, sections and inline runs', async () => {
  const records = await fixture();
  const commit = request('wiki', [
    create('section', { kind: 'section' }, 'page-a'),
    create('wiki-paragraph', { kind: 'paragraph' }, 'section'),
    create('wiki-run', { kind: 'run', text: 'Distilled summary.' }, 'wiki-paragraph'),
  ]);
  const next = accept(records, commit, await digest(commit), '2026-10-11T12:02:00Z');
  const history = [...records, next];
  for (const node of ['page-a', 'section', 'wiki-paragraph', 'wiki-run']) {
    const passage = {
      address: { node, transaction: node === 'page-a' ? 'seed' : 'wiki' },
      selection: { sequence: 2, start: 0, end: 1 },
    };
    expect(() => validateEvidence(history, [{ claim: endpoint('b'), passage }])).toThrow(
      'Wiki content',
    );
  }
});

import { expect, test } from 'vitest';
import { create, request } from '@/vault/nodes/fixtures.test-support.ts';
import { accept, snapshotOf } from '@/vault/nodes/history.ts';
import { digest } from '@/vault/nodes/json.ts';
import type { SourceReader } from '@/vault/sources.ts';
import { selectText } from './citations.ts';
import { parseWikiRecord } from './records.ts';
import { recordText } from './text.ts';

// A fictional source owner normalizes its prose. Wiki still owns the nested text grammar.
const sources: SourceReader = {
  text: (node, { view, textOf }) => {
    if (node.data?.kind !== 'retained') return;
    return [String(node.data.preamble ?? ''), ...view.children(node.key).map(textOf)]
      .filter(Boolean)
      .join('\n');
  },
  describe: () => undefined,
};

test('UTF-16 selections preserve whitespace and formatting and reject invalid ranges and snapshots', async () => {
  const commit = request('seed', [
    create('user', { kind: 'actor', name: 'Reviewer' }),
    create('claim', { kind: 'paragraph' }),
    {
      ...create('one', { kind: 'run', text: 'Keep ' }, 'claim'),
      placement: { parent: 'claim', order: 'a' },
    },
    {
      ...create('two', { kind: 'run', text: 'mornings free.', marks: ['strong'] }, 'claim'),
      placement: { parent: 'claim', order: 'b' },
    },
    {
      ...create('body-link', { kind: 'link', text: 'body-link' }, 'claim'),
      placement: { parent: 'claim', order: 'c' },
    },
    create('emoji', { kind: 'run', text: '😀 plan' }),
  ]);
  const records = [accept([], commit, await digest(commit), '2026-10-11T10:00:00Z')];
  const view = snapshotOf(records);
  expect(recordText(view.get('claim')!, view, sources)).toBe('Keep mornings free.body-link');
  expect(() =>
    parseWikiRecord({
      kind: 'cite',
      unit: 'utf16',
      claim: { sequence: 1, start: 5, end: 3 },
      passage: { sequence: 1, start: 0, end: 1 },
    }),
  ).toThrow();
  expect(() =>
    selectText({ node: 'claim' }, { sequence: 1, start: 0, end: 1 }, view, sources),
  ).toThrow('exact');
  expect(() =>
    selectText(
      { node: 'claim', transaction: 'seed' },
      { sequence: 1, start: 0, end: 999 },
      view,
      sources,
    ),
  ).toThrow('outside');
  expect(() =>
    selectText(
      { node: 'claim', transaction: 'seed' },
      { sequence: 2, start: 0, end: 1 },
      view,
      sources,
    ),
  ).toThrow('snapshot does not match');
  expect(() =>
    selectText(
      { node: 'emoji', transaction: 'seed' },
      { sequence: 1, start: 1, end: 3 },
      view,
      sources,
    ),
  ).toThrow('surrogate');
  expect(
    selectText(
      { node: 'emoji', transaction: 'seed' },
      { sequence: 1, start: 0, end: 2 },
      view,
      sources,
    ).text,
  ).toBe('😀');
});

test('source normalization composes with retained block grammar and empty table cells', async () => {
  const commit = request('seed', [
    create('user', { kind: 'actor', name: 'Reviewer' }),
    create('source', { kind: 'retained', preamble: 'Original capture context.' }),
    create('paragraph', { kind: 'paragraph' }, 'source'),
    {
      ...create('first', { kind: 'run', text: 'First ' }, 'paragraph'),
      placement: { parent: 'paragraph', order: 'a' },
    },
    {
      ...create('second', { kind: 'run', text: 'second.' }, 'paragraph'),
      placement: { parent: 'paragraph', order: 'b' },
    },
    create('row', { kind: 'row' }),
    { ...create('empty-cell', { kind: 'cell' }, 'row'), placement: { parent: 'row', order: 'a' } },
    { ...create('filled-cell', { kind: 'cell' }, 'row'), placement: { parent: 'row', order: 'b' } },
    create('cell-words', { kind: 'run', text: 'Value' }, 'filled-cell'),
    create('unknown', { kind: 'unknown', text: 'Payload meaning is not inferred.' }),
  ]);
  const records = [accept([], commit, await digest(commit), '2026-10-11T10:00:00Z')];
  const view = snapshotOf(records);
  expect(recordText(view.get('source')!, view, sources)).toBe(
    'Original capture context.\nFirst second.',
  );
  expect(recordText(view.get('row')!, view, sources)).toBe('\tValue');
  expect(() => recordText(view.get('unknown')!, view, sources)).toThrow('Unsupported source');
});

import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../nodes/memory.ts';
import { create, request, revise } from '../nodes/fixtures.test-support.ts';
import { describeSource } from '../sources.ts';
import { retainedRecordSources } from './sources.ts';

test('retained Resource reading preserves child blocks and historical attribution for its passages', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('resource', {
        kind: 'resource',
        title: 'Original reference',
        url: 'https://example.com/original',
      }),
      {
        ...create('first', { kind: 'paragraph' }, 'resource'),
        placement: { parent: 'resource', order: 'a' },
      },
      {
        ...create('second', { kind: 'paragraph' }, 'resource'),
        placement: { parent: 'resource', order: 'b' },
      },
      create('relationship', { kind: 'relationship', text: 'Never prose.' }, 'resource'),
      create('untitled', { kind: 'resource', url: 'https://example.com/untitled' }),
      create('foreign', { kind: 'foreign', title: 'Unknown', text: 'Should not project.' }),
    ]),
  );
  const original = await nodes.snapshot();
  await nodes.commit(
    request('changed', [
      await revise(nodes, 'resource', {
        kind: 'resource',
        title: 'Edited reference',
        url: 'https://example.com/edited',
      }),
    ]),
  );
  const current = await nodes.snapshot();
  const textOf = (node: import('../nodes/model.ts').NodeVersion) => {
    if (node.key.node === 'first') return 'First retained block.';
    if (node.key.node === 'second') return 'Second retained block.';
    return retainedRecordSources.text(node, { view: original, textOf }) ?? '';
  };
  expect(textOf(original.get('resource')!)).toBe('First retained block.\nSecond retained block.');
  expect(describeSource(original.get('first')!, original, [retainedRecordSources])).toEqual({
    title: 'Original reference',
    href: 'https://example.com/original',
    capture: false,
  });
  expect(describeSource(current.get('first')!, current, [retainedRecordSources])).toEqual({
    title: 'Edited reference',
    href: 'https://example.com/edited',
    capture: false,
  });
  expect(retainedRecordSources.describe(original.get('untitled')!, original)).toEqual({
    title: 'https://example.com/untitled',
    href: 'https://example.com/untitled',
  });
  expect(
    retainedRecordSources.text(original.get('foreign')!, { view: original, textOf }),
  ).toBeUndefined();
  expect(retainedRecordSources.describe(original.get('foreign')!, original)).toBeUndefined();
  nodes.close();
});

test('unclaimed records keep their retained text format instead of interpreting new prose fields', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('question', { kind: 'question', text: 'Original question?' }),
      create('task', { kind: 'task', what: 'Not part of the retained text format.' }),
      create('decision', { kind: 'decision', what: 'Not projected.', why: 'Not projected.' }),
      create('term', { kind: 'term', label: 'Not projected.' }),
      create('timeline', { kind: 'timeline' }),
      create('date', { kind: 'date', date: '2026-10-01' }, 'timeline'),
    ]),
  );
  const view = await nodes.snapshot();
  const context = { view, textOf: () => 'Child text.' };
  expect(retainedRecordSources.text(view.get('question')!, context)).toBeUndefined();
  for (const node of ['task', 'decision', 'term'])
    expect(retainedRecordSources.text(view.get(node)!, context)).toBe('');
  expect(retainedRecordSources.text(view.get('timeline')!, context)).toBe('Child text.');
  nodes.close();
});

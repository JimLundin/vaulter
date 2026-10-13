import { expect, test } from 'vitest';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { describeWikiTarget, wikiSources } from './sources.ts';

test('Wiki supplies exact owned prose and historical page navigation without guessing foreign text', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('paragraph', { kind: 'paragraph' }, 'page'),
      create('words', { kind: 'run', text: 'The garden wall.' }, 'paragraph'),
      create('question', { kind: 'question', text: 'Which wall?' }, 'page'),
      create('foreign', { kind: 'foreign', text: 'Unknown grammar.' }),
    ]),
  );
  const original = await nodes.snapshot();
  await nodes.commit(
    request('changed', [await revise(nodes, 'page', { kind: 'page', title: 'New studio' })]),
  );
  const current = await nodes.snapshot();
  expect(wikiSources.exactText?.(original.get('words')!, original)).toBe('The garden wall.');
  for (const node of ['page', 'paragraph', 'question', 'foreign'])
    expect(wikiSources.exactText?.(original.get(node)!, original)).toBeUndefined();
  expect(describeWikiTarget(original.get('question')!, original)).toEqual({
    title: 'Studio',
    href: '#/wiki/page/',
    navigationLabel: 'Open Wiki page: Studio',
  });
  expect(describeWikiTarget(current.get('words')!, current)?.title).toBe('New studio');
  expect(describeWikiTarget(original.get('foreign')!, original)).toBeUndefined();
  nodes.close();
});

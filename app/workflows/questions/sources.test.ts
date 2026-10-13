import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { questionSources } from './sources.ts';

test('Question source text retains the historical grammar and subject attribution', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('question', { kind: 'question', text: 'Where should it go?' }, 'page'),
      create('foreign', { kind: 'content', text: 'Outside Questions.' }),
    ]),
  );
  const original = await nodes.snapshot();
  await nodes.commit(
    request('edited', [await revise(nodes, 'question', { kind: 'question', text: 'Which wall?' })]),
  );
  const current = await nodes.snapshot();
  const context = { view: original, textOf: () => 'Other text.' };
  expect(questionSources.text(original.get('question')!, context)).toBe('Where should it go?');
  expect(questionSources.text(current.get('question')!, { ...context, view: current })).toBe(
    'Which wall?',
  );
  expect(questionSources.describe(original.get('question')!, original)).toEqual({
    title: 'Studio',
  });
  expect(questionSources.text(original.get('foreign')!, context)).toBeUndefined();
  expect(questionSources.describe(original.get('foreign')!, original)).toBeUndefined();
  nodes.close();
});

test('Questions reads direct Answers as retained evidence with their original text and subject', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('answered', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('question', { kind: 'question', text: 'Which wall?' }, 'page'),
      create('answer', { kind: 'answer', text: 'The garden wall.' }, 'question'),
    ]),
  );
  const original = await nodes.snapshot();
  await nodes.commit(
    request('edited', [await revise(nodes, 'answer', { kind: 'answer', text: 'Another wall.' })]),
  );
  const answer = original.get('answer')!;
  expect(questionSources.text(answer, { view: original, textOf: () => '' })).toBe(
    'The garden wall.',
  );
  expect(questionSources.describe(answer, original)).toEqual({ title: 'Studio' });
  nodes.close();
});

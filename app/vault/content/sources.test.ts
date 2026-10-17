import { expect, test } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, revise } from '@/vault/nodes/fixtures.test-support.ts';
import { contentSources } from './sources.ts';

test('Content supplies its historical text and title as independently owned source material', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('content', {
        kind: 'content',
        title: 'Original report',
        text: 'Keep mornings 🪴 free.',
      }),
      create('foreign', { kind: 'foreign', title: 'Other module', text: 'Other module text' }),
    ]),
  );
  const historical = await nodes.snapshot();
  await nodes.commit(
    request('changed', [
      await revise(nodes, 'content', {
        kind: 'content',
        title: 'Renamed report',
        text: 'Changed report.',
      }),
    ]),
  );
  const view = await nodes.snapshot();
  expect(
    contentSources.text(historical.get('content')!, { view: historical, textOf: () => '' }),
  ).toBe('Keep mornings 🪴 free.');
  expect(contentSources.describe(historical.get('content')!, historical)).toEqual({
    title: 'Original report',
  });
  expect(contentSources.describe(view.get('content')!, view)).toEqual({ title: 'Renamed report' });
  expect(contentSources.exactText?.(historical.get('content')!, historical)).toBe(
    'Keep mornings 🪴 free.',
  );
  expect(contentSources.exactText?.(view.get('foreign')!, view)).toBeUndefined();
  expect(contentSources.text(view.get('foreign')!, { view, textOf: () => '' })).toBeUndefined();
  expect(contentSources.describe(view.get('foreign')!, view)).toBeUndefined();
  nodes.close();
});

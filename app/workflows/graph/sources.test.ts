import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { graphSources } from './sources.ts';

test('Graph source reading retains non-prose and historical containment semantics', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Original page' }),
      create('relationship', { kind: 'relationship', predicate: 'tag', label: 'Work' }, 'page'),
      create('term', { kind: 'term', scheme: 'tag', key: 'work' }, 'page'),
      create('query', { kind: 'query' }, 'page'),
      create('words', { kind: 'content', text: 'Recorded explanation' }, 'term'),
    ]),
  );
  const original = await nodes.snapshot();
  const context = { view: original, textOf: () => 'Recorded explanation' };
  expect(graphSources.text(original.get('relationship')!, context)).toBe('');
  expect(graphSources.text(original.get('term')!, context)).toBe('Recorded explanation');
  expect(graphSources.text(original.get('query')!, context)).toBe('');
  expect(graphSources.text(original.get('page')!, context)).toBeUndefined();
  expect(graphSources.describe(original.get('term')!, original)).toEqual({
    title: 'Original page',
  });
  expect(graphSources.describe(original.get('page')!, original)).toBeUndefined();
  await nodes.commit(
    request('edit', [await revise(nodes, 'page', { kind: 'page', title: 'Renamed page' })]),
  );
  expect(graphSources.describe(original.get('term')!, original)?.title).toBe('Original page');
  expect(graphSources.describe(original.get('term')!, await nodes.snapshot())?.title).toBe(
    'Renamed page',
  );
  nodes.close();
});

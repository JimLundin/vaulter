import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request, revise } from '../vault/nodes/fixtures.test-support.ts';
import { applicationGraph, applicationSources } from './composition.ts';

test('Application composes Graph snapshot reading and Graph-owned historical sources', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('term', { kind: 'term', scheme: 'type', key: 'place' }),
      {
        ...create('type', { kind: 'relationship', predicate: 'type' }, 'page'),
        connection: { source: { node: 'page' }, target: { node: 'term' } },
      },
    ]),
  );
  const original = await applicationGraph(nodes);
  expect(original.vocabulary('type')[0].data.key).toBe('place');
  expect(
    original.query({ kind: 'query', type: 'place' }, [{ node: 'page', title: 'Studio' }]),
  ).toHaveLength(1);
  const view = await nodes.snapshot();
  expect(applicationSources.text(view.get('type')!, { view, textOf: () => '' })).toBe('');
  expect(applicationSources.describe(view.get('type')!, view)?.title).toBe('Studio');
  await nodes.commit(request('delete', [await revise(nodes, 'term', null)]));
  expect((await applicationGraph(nodes)).vocabulary()).toEqual([]);
  expect((await applicationGraph(nodes, 1)).vocabulary()).toHaveLength(1);
  expect(original.vocabulary()).toHaveLength(1);
  nodes.close();
});

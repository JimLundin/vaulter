import { expect, test } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, revise } from '@/vault/nodes/fixtures.test-support.ts';
import { readWiki } from '@/workflows/wiki/pages.ts';
import { applicationGraph, applicationSources, applicationWikiGraph } from './composition.ts';

test('Wiki metadata and embedded queries share Graph interpretation independently of placement', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor' }),
      create('index', { kind: 'page', title: 'Index' }),
      create('studio', { kind: 'page', title: 'Studio' }),
      create('term', { kind: 'term', scheme: 'type', key: 'place', label: 'Place' }),
      create('tag', { kind: 'term', scheme: 'area', key: 'work', label: 'Creative work' }),
      create('query', { kind: 'query', type: 'place', tag: 'work' }, 'index'),
      {
        ...create('type', { kind: 'relationship', predicate: 'type' }, 'index'),
        connection: { source: { node: 'studio' }, target: { node: 'term' } },
      },
      {
        ...create('classification', { kind: 'relationship', predicate: 'tag' }),
        connection: { source: { node: 'studio', transaction: 'seed' }, target: { node: 'tag' } },
      },
    ]),
  );
  const pages = await readWiki(nodes, applicationSources, applicationWikiGraph);
  const studio = pages.find((page) => page.id === 'studio')!;
  const index = pages.find((page) => page.id === 'index')!;
  const graph = await applicationGraph(nodes);
  expect(studio.metadata).toEqual(graph.classifications({ node: 'studio', transaction: 'seed' }));
  expect(studio.kind).toBe('place');
  expect(studio.entry.g).toEqual(['work']);
  expect(index.metadata).toEqual([]);
  // Placement controls where the relationship is rendered; source controls what it classifies.
  expect(index.blocks.find((block) => block.id === 'type')?.data.label).toBe('Place');
  expect(
    index.blocks.find((block) => block.id === 'query')?.children.map((block) => block.data.text),
  ).toEqual(['Studio']);
  await nodes.commit(
    request('edit', [await revise(nodes, 'studio', { kind: 'page', title: 'Edited studio' })]),
  );
  const changed = await readWiki(nodes, applicationSources, applicationWikiGraph);
  expect(
    changed.find((page) => page.id === 'studio')?.metadata.map((term) => term.relationship),
  ).toEqual(['type']);
  expect(
    changed.find((page) => page.id === 'index')?.blocks.find((block) => block.id === 'query')
      ?.children,
  ).toEqual([]);
  nodes.close();
});

test('Wiki and Graph keep exact classifications while excluding deleted identity classifications', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('term', { kind: 'term', scheme: 'area', key: 'work', label: 'Creative work' }),
      create('query', { kind: 'query', tag: 'work' }, 'page'),
      {
        ...create('exact', { kind: 'relationship', predicate: 'tag' }, 'page'),
        connection: { source: { node: 'page' }, target: { node: 'term', transaction: 'seed' } },
      },
      {
        ...create('live', { kind: 'relationship', predicate: 'tag' }, 'page'),
        connection: { source: { node: 'page' }, target: { node: 'term' } },
      },
    ]),
  );
  await nodes.commit(request('delete', [await revise(nodes, 'term', null)]));
  const [page] = await readWiki(nodes, applicationSources, applicationWikiGraph);
  const graph = await applicationGraph(nodes);
  expect(page.metadata).toEqual(graph.classifications({ node: 'page' }));
  expect(page.metadata.map((term) => term.state)).toEqual(['resolved', 'deleted']);
  expect(page.entry.g).toEqual(['work']);
  expect(
    page.blocks.find((block) => block.id === 'query')?.children.map((block) => block.id),
  ).toEqual(['query:page']);
  nodes.close();
});

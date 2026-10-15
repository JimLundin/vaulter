import { expect, test } from 'vitest';
import type { NodeAddress } from '../../vault/nodes/model.ts';
import type { NodeChange } from '../../vault/nodes/store.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { readGraph } from './reading.ts';

const relation = (
  id: string,
  source: string | NodeAddress,
  target: string | NodeAddress,
  predicate = 'uses',
  parent?: string,
): NodeChange => ({
  ...create(id, { kind: 'relationship', predicate }, parent),
  connection: {
    source: typeof source === 'string' ? { node: source } : source,
    target: typeof target === 'string' ? { node: target } : target,
  },
});
const seed = () => [
  create('user', { kind: 'actor' }),
  create('a', { kind: 'content', title: 'A' }),
  create('b', { kind: 'content', title: 'B' }),
  create('c', { kind: 'content', title: 'C' }),
];

test('connections govern both directions independently of relationship placement', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      create('uses', {
        kind: 'term',
        scheme: 'predicate',
        key: 'uses',
        label: 'Uses',
        inverse: 'Used by',
      }),
      relation('edge', 'a', 'b', 'uses', 'c'),
    ]),
  );
  const graph = readGraph(await nodes.snapshot());
  expect(graph.relationships({ node: 'a' })).toMatchObject([
    {
      direction: 'outgoing',
      label: 'Uses',
      source: { state: 'available' },
      target: { state: 'available' },
    },
  ]);
  expect(graph.relationships({ node: 'b' })).toMatchObject([
    { direction: 'incoming', label: 'Used by' },
  ]);
  expect(graph.relationships({ node: 'c' })).toEqual([]);
  expect(graph.relationships({ node: 'a' }, { direction: 'incoming' })).toEqual([]);
  expect(graph.relationships({ node: 'a' }, { predicate: 'other' })).toEqual([]);
  const moved = await revise(nodes, 'edge', { kind: 'relationship', predicate: 'uses' });
  await nodes.commit(request('move', [{ ...moved, placement: { parent: 'b', order: 'a' } }]));
  expect(readGraph(await nodes.snapshot()).relationships({ node: 'a' })).toHaveLength(1);
  nodes.close();
});

test('vocabulary keeps schemes distinct and uses symmetric labels on both sides', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      create('friend', {
        kind: 'term',
        scheme: 'predicate',
        key: 'friend',
        label: 'Friends',
        symmetric: true,
      }),
      create('tag', { kind: 'term', scheme: 'tag', key: 'friend', label: 'Friendship' }),
      relation('edge', 'a', 'b', 'friend'),
    ]),
  );
  const graph = readGraph(await nodes.snapshot());
  expect(graph.vocabulary('tag').map((term) => term.node.key.node)).toEqual(['tag']);
  expect(graph.vocabulary()).toHaveLength(2);
  expect(graph.relationships({ node: 'b' })[0].label).toBe('Friends');
  await nodes.commit(
    request('ambiguous', [
      create('duplicate', {
        kind: 'term',
        scheme: 'predicate',
        key: 'friend',
        label: 'Another meaning',
      }),
    ]),
  );
  expect(readGraph(await nodes.snapshot()).relationships({ node: 'b' })[0].label).toBe('friend');
  expect(graph.relationships({ node: 'b' })[0].label).toBe('Friends');
  nodes.close();
});

test('unresolved labels and deleted endpoints remain inspectable without becoming traversal nodes', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      create('unresolved', { kind: 'relationship', predicate: 'tag', label: 'Work' }, 'a'),
      relation('edge', 'a', 'b'),
    ]),
  );
  await nodes.commit(request('delete', [await revise(nodes, 'b', null)]));
  const graph = readGraph(await nodes.snapshot());
  expect(graph.relationships({ node: 'a' })).toMatchObject([
    { node: { key: { node: 'edge' } }, target: { state: 'deleted' } },
    { node: { key: { node: 'unresolved' } }, target: { state: 'unresolved' } },
  ]);
  expect(graph.traverse({ node: 'a' }).nodes.map((node) => node.key.node)).toEqual(['a']);
  expect(graph.traverse({ node: 'b' })).toEqual({ nodes: [], relationships: [] });
  expect(graph.relationships({ node: 'b' })).toHaveLength(1);
  nodes.close();
});

test('exact endpoints retain old content through edits and deletion with no fallback', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      relation('exact', 'a', { node: 'b', transaction: 'seed' }),
      relation('live', 'a', 'b'),
    ]),
  );
  const old = readGraph(await nodes.snapshot());
  await nodes.commit(
    request('edit', [await revise(nodes, 'b', { kind: 'content', title: 'New B' })]),
  );
  let graph = readGraph(await nodes.snapshot());
  expect(
    graph.relationships({ node: 'b', transaction: 'seed' }).map((edge) => edge.node.key.node),
  ).toEqual(['exact']);
  expect(graph.relationships({ node: 'b' })).toHaveLength(2);
  expect(
    graph.traverse({ node: 'a' }, { direction: 'outgoing' }).nodes.map((node) => node.key),
  ).toEqual([
    { node: 'a', transaction: 'seed' },
    { node: 'b', transaction: 'seed' },
    { node: 'b', transaction: 'edit' },
  ]);
  expect(graph.relationships({ node: 'b', transaction: 'unknown' })).toEqual([]);
  await nodes.commit(request('delete', [await revise(nodes, 'b', null)]));
  graph = readGraph(await nodes.snapshot());
  expect(graph.relationships({ node: 'a' })[0].target).toMatchObject({
    state: 'available',
    version: { data: { title: 'B' } },
    current: { data: null },
  });
  expect(graph.relationships({ node: 'a' })[1].target.state).toBe('deleted');
  expect(old.relationships({ node: 'a' })[1].target.state).toBe('available');
  const cutoff = readGraph(await nodes.snapshot(1));
  expect(cutoff.traverse({ node: 'b', transaction: 'edit' }).nodes).toEqual([]);
  nodes.close();
});

test('traversal terminates cycles, deduplicates self relationships and respects depth and direction', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      relation('ab', 'a', 'b'),
      relation('bc', 'b', 'c'),
      relation('ca', 'c', 'a'),
      relation('self', 'a', 'a'),
    ]),
  );
  const graph = readGraph(await nodes.snapshot());
  expect(graph.relationships({ node: 'a' }).map((edge) => edge.node.key.node)).toEqual([
    'ab',
    'ca',
    'self',
  ]);
  const result = graph.traverse({ node: 'a' }, { direction: 'outgoing' });
  expect(result.nodes.map((node) => node.key.node)).toEqual(['a', 'b', 'c']);
  expect(result.relationships).toHaveLength(4);
  expect(result.relationships.find((edge) => edge.node.key.node === 'ab')?.direction).toBe(
    'outgoing',
  );
  expect(
    graph
      .traverse({ node: 'a' }, { direction: 'incoming', maxDepth: 1 })
      .nodes.map((node) => node.key.node),
  ).toEqual(['a', 'c']);
  expect(graph.traverse({ node: 'a' }, { maxDepth: 0 }).relationships).toEqual([]);
  expect(() => graph.traverse({ node: 'a' }, { maxDepth: -1 })).toThrow('depth');
  expect(() => graph.traverse({ node: 'a' }, { maxDepth: 0.5 })).toThrow('depth');
  nodes.close();
});

test('deleting a container hides its terms and relationships without erasing their history', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      create('container', { kind: 'content' }),
      create('term', { kind: 'term', scheme: 'tag', key: 'work' }, 'container'),
      relation('edge', 'a', 'b', 'uses', 'container'),
    ]),
  );
  await nodes.commit(request('delete', [await revise(nodes, 'container', null)]));
  const graph = readGraph(await nodes.snapshot());
  expect(graph.vocabulary()).toEqual([]);
  expect(graph.relationships({ node: 'a' })).toEqual([]);
  expect((await nodes.snapshot()).get('edge')?.data).not.toBeNull();
  expect(readGraph(await nodes.snapshot(1)).relationships({ node: 'a' })).toHaveLength(1);
  await nodes.commit(request('restore', [await revise(nodes, 'container', { kind: 'content' })]));
  expect(readGraph(await nodes.snapshot()).relationships({ node: 'a' })).toHaveLength(1);
  nodes.close();
});

test('live queries combine type and tag, use connection sources, and keep candidate presentation', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      create('place', { kind: 'term', scheme: 'type', key: 'place' }),
      create('work', { kind: 'term', scheme: 'area', key: 'work', label: 'Creative work' }),
      relation('type-a', 'a', 'place', 'type', 'c'),
      relation('type-b', 'b', 'place', 'type'),
      relation('tag-a', 'a', 'work', 'tag'),
      create('tag-b', { kind: 'relationship', predicate: 'tag', label: 'work' }, 'b'),
    ]),
  );
  const graph = readGraph(await nodes.snapshot());
  const candidates = [
    { node: 'b', title: 'Beta', created: '2026-01', detail: 2 },
    { node: 'a', title: 'Alpha', created: '2026-02', detail: 1 },
    { node: 'c', title: 'Gamma', created: '2026-03', detail: 3 },
    { node: 'missing', title: 'Missing', detail: 0 },
  ];
  const selection = { kind: 'query', type: 'place', tag: 'work' } as const;
  expect(graph.query(selection, candidates).map((candidate) => candidate.detail)).toEqual([1, 2]);
  expect(
    graph.query({ ...selection, sort: 'created' }, candidates).map((candidate) => candidate.node),
  ).toEqual(['b', 'a']);
  expect(graph.query(selection, candidates)[0]).toBe(candidates[1]);
  expect(candidates.map((candidate) => candidate.node)).toEqual(['b', 'a', 'c', 'missing']);
  await nodes.commit(request('delete', [await revise(nodes, 'work', null)]));
  expect(
    readGraph(await nodes.snapshot())
      .query(selection, candidates)
      .map((candidate) => candidate.node),
  ).toEqual(['b']);
  expect(graph.query(selection, candidates)).toHaveLength(2);
  nodes.close();
});

test('query ordering is stable, duplicate candidates collapse, and deleted candidates disappear', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(request('seed', seed()));
  const candidates = [
    { node: 'b', title: 'Same' },
    { node: 'a', title: 'Same' },
    { node: 'b', title: 'Duplicate' },
  ];
  expect(
    readGraph(await nodes.snapshot())
      .query({ kind: 'query' }, candidates)
      .map((entry) => entry.node),
  ).toEqual(['a', 'b']);
  await nodes.commit(request('delete', [await revise(nodes, 'a', null)]));
  expect(
    readGraph(await nodes.snapshot())
      .query({ kind: 'query' }, candidates)
      .map((entry) => entry.node),
  ).toEqual(['b']);
  nodes.close();
});

test('exact-source classifications do not classify a later version of the candidate', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      ...seed(),
      create('term', { kind: 'term', scheme: 'type', key: 'place' }),
      relation('type', { node: 'a', transaction: 'seed' }, 'term', 'type'),
    ]),
  );
  const candidates = [{ node: 'a', title: 'A' }];
  const query = { kind: 'query', type: 'place' } as const;
  expect(readGraph(await nodes.snapshot()).query(query, candidates)).toHaveLength(1);
  await nodes.commit(
    request('edit', [await revise(nodes, 'a', { kind: 'content', title: 'Edited A' })]),
  );
  expect(readGraph(await nodes.snapshot()).query(query, candidates)).toEqual([]);
  nodes.close();
});

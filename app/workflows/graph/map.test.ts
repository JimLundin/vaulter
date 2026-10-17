import { expect, test } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request } from '@/vault/nodes/fixtures.test-support.ts';
import { projectGraphExplorer } from './explorer.ts';
import { projectGraphMap, type GraphMapTopic } from './map.ts';

test('shared sources retain every topic membership, reviewed citation and full incident count', () => {
  const topics: GraphMapTopic[] = ['a', 'b'].map((id) => ({
    id,
    title: id,
    metadata: [],
    blocks: [
      {
        id: `${id}-statement`,
        data: { kind: 'paragraph', text: `${id} claim` },
        children: [],
        evidence: [
          {
            id: `${id}-citation`,
            title: 'Shared source',
            text: `${id} passage`,
            state: 'original',
            source: { node: 'source', transaction: 'original' },
          },
        ],
      },
    ],
  }));
  const map = projectGraphMap(topics, { graph: null, subjects: [], loading: false });
  expect(map.records.filter((record) => record.id === 'source')).toEqual([
    expect.objectContaining({ parentTopics: ['a', 'b'], connections: 2, group: 'Shared' }),
  ]);
  expect(map.records.find((record) => record.id === 'a-statement')?.connections).toBe(2);
  expect(map.edges).toHaveLength(4);
  expect(topics[1].blocks[0].evidence[0].text).toBe('b passage');
});

test('relationships are deduplicated across endpoints and include subjects outside topics', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor' }),
      create('a', { kind: 'page', title: 'A' }),
      create('b', { kind: 'page', title: 'B' }),
      create('c', { kind: 'content', title: 'C' }),
      ...[
        ['ab', 'a', 'b'],
        ['bc', 'b', 'c'],
        ['self', 'c', 'c'],
      ].map(([id, source, target]) => ({
        ...create(id, { kind: 'relationship', predicate: 'related-to' }, source),
        connection: { source: { node: source }, target: { node: target } },
      })),
    ]),
  );
  const state = projectGraphExplorer(await nodes.snapshot(), (node) => ({
    title: String(node.data?.title),
  }));
  const map = projectGraphMap([{ id: 'a', title: 'A', blocks: [], metadata: [] }], state);
  expect(map.edges.map((edge) => edge.id).sort()).toEqual(['ab', 'bc', 'self']);
  expect(map.records.find((record) => record.id === 'c')).toMatchObject({
    connections: 2,
    parentTopics: [],
  });
  expect(map.records.find((record) => record.id === 'b')?.connections).toBe(2);
  nodes.close();
});

import { expect, test } from 'vitest';
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
            address: {
              format: 'vaulter-eav-snapshot-v1',
              scope: 'vault',
              journal: 'journal',
              entity: 'source',
              type: 'source.document',
              transaction: 'original',
            },
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

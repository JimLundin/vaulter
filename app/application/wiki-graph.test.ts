import { expect, test } from 'vitest';
import { e, openDatabase } from '@/vault/eav/index.ts';
import { wikiSchema } from '@/workflows/wiki/data/schema.ts';
import { wikiActions } from '@/workflows/wiki/data/operations.ts';
import { graphEntities } from '@/workflows/graph/data/schema.ts';
import { topicActions } from '@/workflows/graph/data/topics.ts';
import { graphActions } from '@/workflows/graph/data/operations.ts';
import { projectGraphExplorer } from '@/workflows/graph/explorer.ts';
import { projectGraphMap } from '@/workflows/graph/map.ts';
import { readWikiGraphTopics } from './wiki-graph.ts';

test('editorial Topics use retained subject identity, current member prose and exact native evidence', async () => {
  await using db = await openDatabase({ schema: e.registry({ ...wikiSchema, ...graphEntities }) });
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Editor', kind: 'user' }),
  );
  const wiki = wikiActions(db, author);
  const broad = await wiki.createPage({ key: 'garden', title: 'Garden', summary: '' });
  const narrow = await wiki.createPage({ key: 'water', title: 'Watering', summary: '' });
  const paragraph = await wiki.append(
    'paragraph',
    { kind: 'paragraph' },
    { page: narrow, order: 'a' },
  );
  await wiki.append(
    'words',
    { kind: 'text', text: 'Water slowly.' },
    { parent: paragraph, order: 'a' },
  );
  const document = await db.transaction({ author }, (tx) =>
    tx.entities.sourceDocuments.insert({
      key: 'source',
      title: 'Source',
      text: 'Water slowly.',
      origin: 'https://example.invalid',
      attribution: 'Gardener',
      capturedAt: new Date(),
      available: true,
    }),
  );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const subject = await db.history.reference(snapshot, broad);
  const member = await db.history.reference(snapshot, narrow);
  const assertion = await db.history.reference(snapshot, paragraph);
  const source = await db.history.reference(snapshot, document);
  const topics = topicActions(db, { author });
  await topics.promote({ key: 'garden', subject, title: 'Garden topic', rationale: 'Broad area.' });
  await topics.addMember('garden', member, true, 'Watering belongs here.');
  await wiki.review({
    key: 'review',
    assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 13 },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 13 }],
    result: 'supported',
    rationale: 'Exact passage.',
  });
  await graphActions(db, { author }).connect({
    key: 'related',
    predicate: 'related-to',
    source: subject,
    target: member,
  });
  let projected = await readWikiGraphTopics(db);
  expect(projected[0]).toMatchObject({
    id: subject.entity,
    title: 'Garden topic',
    href: '#/wiki/garden/',
    available: true,
  });
  expect(projected[0]?.blocks[0]).toMatchObject({
    id: assertion.entity,
    evidence: [{ address: source, text: 'Water slowly.' }],
  });
  const map = projectGraphMap(projected, await projectGraphExplorer(db));
  expect(map.edges.find((edge) => edge.id === 'related')).toMatchObject({
    source: subject.entity,
    target: member.entity,
  });
  expect(map.records.filter((record) => record.id === subject.entity)).toHaveLength(1);
  await wiki.updatePage(broad, { available: false });
  await db.transaction({ author }, (tx) => tx.entities.sourceDocuments.delete(document));
  projected = await readWikiGraphTopics(db);
  expect(projected[0]?.available).toBe(false);
  expect(projected[0]?.blocks[0]?.evidence[0]).toMatchObject({
    text: 'Water slowly.',
    state: 'deleted',
  });
});

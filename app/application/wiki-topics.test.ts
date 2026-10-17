import { expect, test } from 'vitest';
import { e, openDatabase } from '@/vault/eav/index.ts';
import { wikiSchema } from '@/workflows/wiki/data/schema.ts';
import { wikiActions } from '@/workflows/wiki/data/operations.ts';
import { topicEntities } from '@/workflows/graph/data/schema.ts';
import { topicActions, readTopics, topicMembers } from '@/workflows/graph/data/topics.ts';

test('page existence does not promote a topic and one broad topic keeps independently reachable members', async () => {
  await using db = await openDatabase({ schema: e.registry({ ...wikiSchema, ...topicEntities }) });
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Editor', kind: 'user' }),
  );
  const wiki = wikiActions(db, author);
  const broad = await wiki.createPage({ key: 'garden', title: 'Garden planning', summary: '' });
  const narrow = await wiki.createPage({ key: 'irrigation', title: 'Irrigation', summary: '' });
  expect(await readTopics(db)).toEqual([]);
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const topics = topicActions(db, { author });
  await topics.promote({
    key: 'garden',
    subject: await db.history.reference(snapshot, broad),
    title: 'Garden planning',
    rationale: 'A recurring area of work.',
  });
  await topics.addMember(
    'garden',
    await db.history.reference(snapshot, narrow),
    true,
    'Irrigation is narrower planning material.',
  );
  expect(await readTopics(db)).toMatchObject([{ id: 'garden', title: 'Garden planning' }]);
  expect((await topicMembers(db, 'garden', 1)).members).toHaveLength(1);
  expect(await db.entities.wikiPages.query({ select: {} })).toHaveLength(2);
});

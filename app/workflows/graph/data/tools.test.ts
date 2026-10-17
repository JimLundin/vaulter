import { expect, test } from 'vitest';
import { e, openDatabase, sameEntity } from '@/vault/eav/index.ts';
import { Actor } from '@/vault/records/actor.ts';
import { graphEntities } from './schema.ts';
import { graphTools } from './tools.ts';

const Subject = e.entity('test.subject', { title: e.string() });
const schema = e.registry({ actors: Actor, subjects: Subject, ...graphEntities });

test('native Graph tools retain vocabulary, queries, connections and editorial Topics with trusted attribution', async () => {
  await using db = await openDatabase({ schema });
  const { author, subject } = await db.transaction(async (tx) => ({
    author: await tx.entities.actors.insert({ name: 'Editor', kind: 'agent' }),
    subject: await tx.entities.subjects.insert({ title: 'Garden' }),
  }));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const address = await db.history.reference(snapshot, subject);
  const abort = new AbortController();
  const tools = graphTools(db, { author }, abort.signal);
  const options = { toolCallId: 'graph', messages: [], context: {} };
  await tools.createGraphTerm.execute!(
    { key: 'related-to', scheme: 'predicate', symmetric: true },
    options,
  );
  await tools.createGraphQuery.execute!({ key: 'garden', tag: 'garden' }, options);
  await tools.createRelationship.execute!(
    { key: 'connection', predicate: 'related-to', source: address, target: address },
    options,
  );
  await tools.promoteTopic.execute!(
    { key: 'garden', subject: address, title: 'Garden', rationale: 'A broad area.' },
    options,
  );
  await tools.addTopicMember.execute!(
    { topic: 'garden', member: address, primary: true, rationale: 'Editorial membership.' },
    options,
  );
  expect(await db.entities.graphRelationships.query({ select: {} })).toHaveLength(1);
  expect(await db.entities.graphQueries.query({ select: {} })).toHaveLength(1);
  expect(await db.entities.topics.query({ select: {} })).toHaveLength(1);
  expect(await db.entities.topicMemberships.query({ select: {} })).toHaveLength(1);
  const latest = (await db.history.transactions.first({
    select: { author: true },
    orderBy: [{ sequence: 'desc' }],
  }))!;
  expect(sameEntity(latest.author, author)).toBe(true);
  abort.abort();
  await expect(
    tools.createGraphTerm.execute!({ key: 'blocked', scheme: 'tag' }, options),
  ).rejects.toThrow();
  expect(await db.entities.graphTerms.query({ select: {} })).toHaveLength(1);
});

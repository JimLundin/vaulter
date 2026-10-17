import { expect, test } from 'vitest';
import { e, openDatabase } from '@/vault/eav/index.ts';
import { Actor } from '@/vault/records/actor.ts';
import { graphEntities } from './data/schema.ts';
import { graphActions } from './data/operations.ts';
import { readGraph } from './reading.ts';
import { projectGraphExplorer } from './explorer.ts';
import { projectGraphMap } from './map.ts';

const Subject = e.entity('test.subject', { title: e.string(), available: e.boolean() });
const schema = e.registry({ actors: Actor, subjects: Subject, ...graphEntities });

test('native graph preserves directed cycles, inverse vocabulary and exact endpoints after deletion', async () => {
  await using db = await openDatabase({ schema });
  const { author, a, b } = await db.transaction(async (tx) => ({
    author: await tx.entities.actors.insert({ name: 'Person', kind: 'user' }),
    a: await tx.entities.subjects.insert({ title: 'A', available: true }),
    b: await tx.entities.subjects.insert({ title: 'B', available: true }),
  }));
  const accepted = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const source = await db.history.reference(accepted, a);
  const target = await db.history.reference(accepted, b);
  await db.transaction({ author }, async (tx) => {
    await tx.entities.graphTerms.insert({
      key: 'knows',
      scheme: 'predicate',
      label: 'knows',
      inverse: 'known by',
      available: true,
    });
  });
  const actions = graphActions(db, { author });
  await actions.connect({ key: 'ab', predicate: 'knows', source, target });
  await actions.connect({ key: 'ba', predicate: 'knows', source: target, target: source });
  await actions.connect({ key: 'self', predicate: 'knows', source, target: source });
  const graph = await readGraph(db);
  expect(graph.relationships(target, { direction: 'incoming' })[0]?.label).toBe('known by');
  expect(graph.relationships(source).map((edge) => edge.id)).toEqual(['ab', 'ba', 'self']);
  expect(graph.traverse(source).entities).toHaveLength(2);
  expect(graph.traverse(source, { maxDepth: 0 }).entities).toHaveLength(1);
  expect(() => graph.traverse(source, { maxDepth: -1 })).toThrow('depth');
  await db.transaction({ author }, (tx) => tx.entities.subjects.delete(b));
  const refreshed = await readGraph(db);
  expect(refreshed.relationships(source).find((edge) => edge.id === 'ab')?.target).toMatchObject({
    state: 'available',
    values: { title: 'B' },
    current: undefined,
  });
  const state = await projectGraphExplorer(db);
  expect(state.subjects.find((subject) => subject.id === target.entity)?.state).toBe('deleted');
  const map = projectGraphMap([], state);
  expect(map.edges.map((edge) => edge.id)).toEqual(['ab', 'ba', 'self']);
  expect(map.records.find((record) => record.id === source.entity)?.connections).toBe(3);
  await actions.remove('ab');
  expect((await readGraph(db)).relationships(source).map((edge) => edge.id)).toEqual([
    'ba',
    'self',
  ]);
  expect(graph.relationships(source)).toHaveLength(3);
});

test('historical classifications retain their selected term and unresolved labels without duplicating candidates', async () => {
  await using db = await openDatabase({ schema });
  const { author, subject, term } = await db.transaction(async (tx) => ({
    author: await tx.entities.actors.insert({ name: 'Person', kind: 'user' }),
    subject: await tx.entities.subjects.insert({ title: 'Studio', available: true }),
    term: await tx.entities.graphTerms.insert({
      key: 'place',
      scheme: 'type',
      label: 'Place',
      available: true,
    }),
  }));
  const accepted = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const source = await db.history.reference(accepted, subject);
  const target = await db.history.reference(accepted, term);
  const actions = graphActions(db, { author });
  await actions.connect({ key: 'type', predicate: 'type', source, target });
  await actions.connect({ key: 'tag', predicate: 'tag', source, label: 'garden' });
  await db.transaction({ author }, (tx) =>
    tx.entities.graphTerms.update({ ...term, key: 'building', label: 'Building' }),
  );
  const graph = await readGraph(db);
  const candidate = { entity: source.entity, title: 'Studio' };
  expect(graph.query({ type: 'place', tag: 'garden' }, [candidate, candidate])).toEqual([
    candidate,
  ]);
  expect(graph.query({ type: 'building' }, [candidate])).toEqual([]);
  expect(
    graph.query({}, [{ entity: 'isolated', title: 'Isolated owner projection' }]),
  ).toHaveLength(1);
  expect(graph.query({}, [{ entity: 'removed', title: 'Removed', available: false }])).toEqual([]);
  expect(graph.classifications(source).find((term) => term.predicate === 'type')).toMatchObject({
    key: 'place',
    label: 'Place',
  });
  await expect(actions.connect({ key: 'type', predicate: 'type', source, target })).rejects.toThrow(
    'already',
  );
});

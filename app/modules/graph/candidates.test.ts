import { expect, test } from 'vitest';
import { createMemoryStorage, e, openDatabase } from '@/core/store/index.ts';
import { Actor } from '@/modules/actors/index.ts';
import { SourceDocument } from '@/modules/sources/index.ts';
import { graphEntities } from './records.ts';
import { graphActions } from './operations.ts';
import { readGraph } from './reading.ts';

const Subject = e.entity('test.subject', { title: e.string(), available: e.boolean() });
const schema = e.registry({
  actors: Actor,
  subjects: Subject,
  sourceDocuments: SourceDocument,
  ...graphEntities,
});

test('candidates retain missing knowledge and imported provenance, resolve and revise one identity through reopen', async () => {
  const storage = createMemoryStorage();
  const db = await openDatabase({ schema, storage });
  const { author, a, b, document } = await db.transaction(async (tx) => ({
    author: await tx.entities.actors.insert({ name: 'Person', kind: 'user' }),
    a: await tx.entities.subjects.insert({ title: 'A', available: true }),
    b: await tx.entities.subjects.insert({ title: 'B', available: true }),
    document: await tx.entities.sourceDocuments.insert({
      key: 'external',
      title: 'Old note',
      text: 'A related to B?',
      origin: 'external:old-note',
      attribution: 'Original author',
      capturedAt: new Date(),
      available: true,
    }),
  }));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const source = await db.history.reference(snapshot, a);
  const target = await db.history.reference(snapshot, b);
  const provenance = await db.history.reference(snapshot, document);
  const actions = graphActions(db, { author });
  const identity = await actions.candidate({
    key: 'uncertain',
    predicate: 'related',
    source,
    target,
    direction: 'unknown',
    clarificationReason: 'Direction was not recorded',
    provenance,
  });
  await actions.candidate({
    key: 'no-endpoints',
    label: 'Nearby',
    direction: 'unknown',
    clarificationReason: 'Neither endpoint was recorded',
  });
  const before = await readGraph(db);
  expect(before.relationships(source)).toEqual([]);
  expect(before.traverse(source).relationships).toEqual([]);
  expect(before.candidates.find((item) => item.id === 'uncertain')).toMatchObject({
    missing: ['direction'],
    provenance: { values: { text: 'A related to B?' } },
  });
  expect(before.candidates.find((item) => item.id === 'no-endpoints')?.missing).toEqual([
    'predicate',
    'source',
    'target',
    'direction',
  ]);
  const candidateAddress = before.candidates.find((item) => item.id === 'uncertain')!.address;
  await expect(
    actions.clarify('uncertain', { source, target, direction: 'unknown', predicate: 'related' }),
  ).rejects.toThrow('reason');
  await expect(
    actions.candidate({
      key: 'fake',
      predicate: 'related',
      source,
      direction: 'unknown',
      clarificationReason: 'Unknown',
      provenance: source,
    }),
  ).rejects.toThrow('source document');
  await actions.clarify('uncertain', {
    predicate: 'related',
    source,
    target,
    direction: 'directed',
  });
  const resolved = await db.entities.graphRelationships.first({
    where: { key: { eq: 'uncertain' } },
    select: { status: true, provenance: true },
  });
  expect(resolved).toMatchObject({ status: 'resolved', provenance });
  const resolvedSnapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const resolvedAddress = await db.history.reference(resolvedSnapshot, resolved!);
  expect(resolvedAddress.entity).toBe(candidateAddress.entity);
  expect((await readGraph(db)).relationships(source).map((edge) => edge.id)).toEqual(['uncertain']);
  expect(
    (
      await db.history.inspect(
        await db.history.resolve(candidateAddress).then((value) => value.transaction),
        identity,
      )
    )?.values.status,
  ).toBe('candidate');
  await actions.clarify('uncertain', {
    predicate: 'related',
    source: target,
    target: source,
    direction: 'directed',
  });
  expect(
    (await readGraph(db)).relationships(target, { direction: 'outgoing' })[0]?.target.address,
  ).toEqual(source);
  await actions.remove('uncertain');
  await expect(
    actions.clarify('uncertain', { predicate: 'related', source, target, direction: 'directed' }),
  ).rejects.toThrow('unavailable');
  await db[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema, storage });
  expect((await readGraph(reopened)).candidates.map((candidate) => candidate.id)).toEqual([
    'no-endpoints',
  ]);
  expect((await readGraph(reopened)).relationships(source)).toEqual([]);
  const removed = await reopened.entities.graphRelationships.first({
    where: { key: { eq: 'uncertain' } },
    select: { available: true, status: true, provenance: true },
  });
  expect(removed).toMatchObject({ available: false, status: 'resolved', provenance });
  expect((await reopened.history.reference(resolvedSnapshot, removed!)).entity).toBe(
    candidateAddress.entity,
  );
});

test('widened relationship schema opens previously accepted directed records unchanged', async () => {
  const LegacyRelationship = e.entity('graph.relationship', {
    key: e.string(),
    predicate: e.string(),
    source: e.historicalRef(),
    target: e.historicalRef().optional(),
    label: e.string().optional(),
    available: e.boolean(),
  });
  const oldSchema = e.registry({
    actors: Actor,
    subjects: Subject,
    sourceDocuments: SourceDocument,
    ...graphEntities,
    graphRelationships: LegacyRelationship,
  });
  const storage = createMemoryStorage();
  const db = await openDatabase({ schema: oldSchema, storage });
  const subject = await db.transaction((tx) =>
    tx.entities.subjects.insert({ title: 'A', available: true }),
  );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const source = await db.history.reference(snapshot, subject);
  await db.transaction((tx) =>
    tx.entities.graphRelationships.insert({
      key: 'existing',
      predicate: 'knows',
      source,
      target: source,
      available: true,
    }),
  );
  await db.transaction((tx) =>
    tx.entities.graphRelationships.insert({
      key: 'old-incomplete',
      predicate: 'related',
      source,
      label: 'Unknown target',
      available: true,
    }),
  );
  await db[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema, storage });
  const graph = await readGraph(reopened);
  expect(graph.candidates).toMatchObject([
    { id: 'old-incomplete', label: 'Unknown target', missing: ['target'] },
  ]);
  expect(graph.relationships(source).map((edge) => edge.id)).toEqual(['existing']);
});

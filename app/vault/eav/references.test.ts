import { expect, test } from 'vitest';
import {
  e,
  openDatabase,
  createMemoryStorage,
  createPersistentStorage,
  sameEntity,
  type Journal,
  type HistoricalReference,
  type EntityRef,
} from './index.ts';

const Source = e.entity('source', { text: e.string() });
const Placement = e.entity('placement', { source: e.ref(Source) });
const schema = e.registry({ sources: Source, placements: Placement });

test('snapshot evidence freezes referenced content and remains readable after deletion', async () => {
  await using db = await openDatabase({ schema });
  const source = await db.transaction((tx) => tx.entities.sources.insert({ text: 'Original' }));
  const placement = await db.transaction((tx) => tx.entities.placements.insert({ source }));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const evidence = await db.history.reference(snapshot, placement);
  expect(Object.isFrozen(evidence)).toBe(true);
  await db.transaction((tx) => tx.entities.sources.update({ ...source, text: 'Changed' }));
  await db.transaction(async (tx) => {
    await tx.entities.placements.delete(placement);
    await tx.entities.sources.delete((await tx.entities.sources.get(source, { select: {} }))!);
  });
  const restored = await db.history.resolve(JSON.parse(JSON.stringify(evidence)));
  expect(sameEntity(restored.entity, placement)).toBe(true);
  const past = db.at(restored.transaction);
  expect(
    await past.entities.placements.get(placement, { select: { source: { text: true } } }),
  ).toMatchObject({ source: { text: 'Original' } });
  expect(await db.history.inspect(restored.transaction, restored.entity)).toMatchObject({
    type: 'placement',
  });
  expect(await db.entities.placements.get(placement, { select: {} })).toBeUndefined();
});

test('serialized references survive a fresh durable adapter and retain their journal identity', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'fictional-vault',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  let evidence: HistoricalReference;
  {
    await using db = await openDatabase({ schema, storage: storage() });
    const source = await db.transaction((tx) => tx.entities.sources.insert({ text: 'Retained' }));
    const snapshot = (await db.history.transactions.first({ select: {} }))!;
    evidence = await db.history.reference(snapshot, source);
    await db.transaction((tx) => tx.entities.sources.delete(source));
  }
  await using reopened = await openDatabase({ schema, storage: storage() });
  const resolved = await reopened.history.resolve(structuredClone(evidence));
  expect(await reopened.history.inspect(resolved.transaction, resolved.entity)).toMatchObject({
    type: 'source',
    values: { text: 'Retained' },
  });
  await using foreign = await openDatabase({
    schema,
    storage: createPersistentStorage({
      scope: 'another-vault',
      load: async () => structuredClone(journal),
      append: () => Promise.reject(new Error('Read-only fixture')),
    }),
  });
  await expect(foreign.history.resolve(evidence)).rejects.toThrow('another database');
});

test('invalid, future, wrong-type and unavailable snapshot targets cannot become evidence', async () => {
  const storage = createMemoryStorage();
  await using db = await openDatabase({ schema, storage });
  const first = await db.transaction((tx) => tx.entities.sources.insert({ text: 'First' }));
  const snapshot = (await db.history.transactions.first({ select: {} }))!;
  const later = await db.transaction((tx) => tx.entities.sources.insert({ text: 'Later' }));
  const evidence = await db.history.reference(snapshot, first);
  await expect(db.history.reference(snapshot, later)).rejects.toThrow('unavailable');
  await expect(
    db.history.reference(snapshot, { text: 'First' } as unknown as EntityRef<typeof Source>),
  ).rejects.toThrow('entity object');
  await Promise.all(
    [
      null,
      {},
      { ...evidence, format: 'unknown' },
      { ...evidence, extra: true },
      { ...evidence, type: 'placement' },
      { ...evidence, entity: 'missing' },
      { ...evidence, transaction: 'missing' },
      { ...evidence, journal: 'missing' },
    ].map((invalid) => expect(db.history.resolve(invalid)).rejects.toThrow()),
  );
  await db.transaction((tx) => tx.entities.sources.delete(first));
  const deleted = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await expect(db.history.reference(deleted, first)).rejects.toThrow('unavailable');
  await expect(
    db.history.resolve({ ...evidence, transaction: storage.inspect().transactions.at(-1)!.id }),
  ).rejects.toThrow('unavailable');
  await using foreign = await openDatabase({ schema });
  await expect(foreign.history.reference(snapshot, first)).rejects.toThrow('entity object');
  await expect(foreign.history.resolve(evidence)).rejects.toThrow('another database');
  const reopened = await openDatabase({ schema, storage });
  expect(await reopened.history.resolve(evidence)).toBeDefined();
  await reopened[Symbol.asyncDispose]();
  await expect(reopened.history.resolve(evidence)).rejects.toThrow('closed');
});

test('unaccepted transaction objects cannot be exported as historical evidence', async () => {
  await using db = await openDatabase({ schema });
  await db.transaction((tx) => tx.entities.sources.insert({ text: 'Accepted' }));
  const snapshot = (await db.history.transactions.first({ select: {} }))!;
  await expect(
    db.transaction(async (tx) => {
      const pending = await tx.entities.sources.insert({ text: 'Pending' });
      await db.history.reference(snapshot, pending);
    }),
  ).rejects.toThrow('unavailable');
  expect(await db.entities.sources.query({ select: { text: true } })).toHaveLength(1);
});

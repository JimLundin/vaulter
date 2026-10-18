import { expect, test } from 'vitest';
import { e, openDatabase, createPersistentStorage, type Journal } from '@/core/store/index.ts';
import {
  calendarEntities,
  calendarSchema,
  createChronology,
  reviseChronology,
  createChronologyItem,
  reviseChronologyItem,
  readChronologies,
  readCalendar,
  readChronology,
  chronologyAdmission,
  readChronologyClosure,
  type TimeValue,
} from './index.ts';

const date: TimeValue = {
  kind: 'point',
  point: { precision: 'day', year: 2026, month: 6, day: 30 },
  approximate: false,
};
const latest = async (db: Parameters<typeof readChronologies>[0]) =>
  (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }))!;

test('unlabelled date contexts retain recurrence and availability without becoming Events', async () => {
  await using db = await openDatabase({ schema: calendarSchema });
  const chronology = await createChronology(db, {
    kind: 'date-context',
    time: date,
    recurrence: 'yearly',
  });
  const original = await latest(db);
  await reviseChronology(db, chronology, {
    kind: 'date-context',
    time: { kind: 'unknown', expression: 'unrecorded date' },
    label: '',
    available: false,
  });
  expect(await readChronologies(db)).toEqual([]);
  expect((await readChronologies(db, { includeUnavailable: true }))[0]).toMatchObject({
    time: { kind: 'unknown' },
    label: '',
    available: false,
  });
  expect((await readChronologies(db, { includeUnavailable: true }))[0]!.recurrence).toBeUndefined();
  expect((await readChronologies(db, { snapshot: original }))[0]!.label).toBeUndefined();
  expect((await readChronologies(db, { snapshot: original }))[0]).toMatchObject({
    time: date,
    recurrence: 'yearly',
    available: true,
    items: [],
  });
  await reviseChronology(db, chronology, { kind: 'date-context', time: date });
  expect((await readChronologies(db))[0]!.label).toBeUndefined();
  expect((await readChronologies(db))[0]!.available).toBe(true);
  expect(await readCalendar(db)).toEqual({ events: [], annualDates: [] });
});

test('independent reopen preserves ordered collection endpoints, removed states and historical revisions', async () => {
  const Note = e.entity('chronology-test.note', { text: e.string() });
  const schema = e.registry({ notes: Note, ...calendarEntities });
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'chronology-reopen',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  {
    await using db = await openDatabase({ schema, storage: storage() });
    const note = await db.transaction((tx) => tx.entities.notes.insert({ text: 'Recorded note' }));
    const before = await latest(db);
    const live = await db.history.retainedStateReference(before, note);
    await db.transaction((tx) => tx.entities.notes.delete(note));
    const deleted = await db.history.retainedStateReference(await latest(db), note);
    const bucket = await createChronology(
      db,
      { kind: 'date-context', time: date, context: live, provenance: deleted },
      [
        { target: deleted, order: 'r', available: false },
        { target: live, order: 'i' },
      ],
    );
    const bucketState = await db.history.retainedStateReference(await latest(db), bucket);
    const collection = await createChronology(db, { kind: 'collection', label: 'Chronology' }, [
      { target: bucketState, order: 'i' },
    ]);
    const extra = await createChronologyItem(db, collection, { target: live, order: 'a' });
    const original = await latest(db);
    await reviseChronologyItem(db, extra, { target: deleted, order: 'z', available: false });
    const historical = await readChronologies(db, { chronology: collection, snapshot: original });
    expect(historical[0]!.items.map((item) => item.order)).toEqual(['a', 'i']);
  }
  await using db = await openDatabase({ schema, storage: storage() });
  const records = await readChronologies(db, { includeUnavailable: true });
  const bucket = records.find((record) => record.kind === 'date-context')!;
  const collection = records.find((record) => record.kind === 'collection')!;
  expect(bucket).toMatchObject({ time: date });
  expect(bucket.label).toBeUndefined();
  expect(bucket.items.map((item) => [item.order, item.available])).toEqual([
    ['i', true],
    ['r', false],
  ]);
  const deleted = await db.history.resolveRetainedState(bucket.items[1]!.target);
  expect(deleted.state).toBe('deleted');
  expect(await db.history.inspect(deleted.transaction, deleted.entity)).toBeUndefined();
  const originalNote = await db.history.resolveRetainedState(bucket.items[0]!.target);
  expect(await db.history.inspect(originalNote.transaction, originalNote.entity)).toMatchObject({
    values: { text: 'Recorded note' },
  });
  const selectedBucket = await db.history.resolveRetainedState(collection.items[0]!.target);
  expect(selectedBucket.state).toBe('live');
  expect(await db.history.inspect(selectedBucket.transaction, selectedBucket.entity)).toMatchObject(
    {
      values: { kind: 'date-context', time: date },
    },
  );
  const projection = await readChronology(db, bucket.ref, { includeUnavailable: true });
  expect(projection!.items[1]).toMatchObject({
    childState: 'deleted',
    recordedChild: { values: { text: 'Recorded note' } },
  });
  expect(collection.items.map((item) => [item.order, item.available])).toEqual([
    ['i', true],
    ['z', false],
  ]);
  expect(
    (await readChronologies(db)).find((record) => record.kind === 'collection')!.items,
  ).toHaveLength(1);
});

test('foreign endpoint rejects the complete collection and invalid dates never publish', async () => {
  await using foreign = await openDatabase({ schema: calendarSchema });
  const target = await createChronology(foreign, { kind: 'collection' });
  const address = await foreign.history.retainedStateReference(await latest(foreign), target);
  await using db = await openDatabase({ schema: calendarSchema });
  await expect(
    createChronology(db, { kind: 'collection' }, [{ target: address, order: 'i' }]),
  ).rejects.toThrow();
  expect(await readChronologies(db)).toEqual([]);
  expect(() =>
    createChronology(db, {
      kind: 'date-context',
      time: {
        kind: 'point',
        point: { precision: 'day', year: 2026, month: 2, day: 30 },
        approximate: false,
      },
    }),
  ).toThrow();
  expect(await readChronologies(db)).toEqual([]);
});

test('transactional cross-owner placement preserves child-only movement and deleted parents after reopen', async () => {
  const schema = calendarSchema;
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'chronology-closure',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  {
    await using db = await openDatabase({ schema, storage: storage() });
    const { parent, child, other } = await db.transaction(async (tx) => {
      const owner = chronologyAdmission(tx);
      return {
        parent: await owner.create({
          kind: 'collection',
          label: 'Original parent',
          available: false,
        }),
        child: await owner.create({ kind: 'date-context', time: date }),
        other: await owner.create({ kind: 'collection', label: 'Other parent' }),
      };
    });
    const parentRef = await db.history.retainedStateReference(await latest(db), parent);
    const childRef = await db.history.retainedStateReference(await latest(db), child);
    const otherRef = await db.history.retainedStateReference(await latest(db), other);
    const placement = await db.transaction((tx) =>
      chronologyAdmission(tx).place({
        parent: parentRef,
        child: childRef,
        order: '0zi',
      }),
    );
    const original = await latest(db);
    await db.transaction((tx) =>
      chronologyAdmission(tx).revisePlacement(placement, {
        parent: otherRef,
        child: childRef,
        order: 'r',
      }),
    );
    expect(await readChronologyClosure(db, parentRef)).toEqual([]);
    expect((await readChronologyClosure(db, parentRef, { snapshot: original }))[0]).toMatchObject({
      order: '0zi',
      recordedChild: { values: { time: date, available: true } },
    });
    // Removing a parent record cannot cascade to its independently retained date context.
    await db.transaction((tx) => tx.entities.calendarChronologies.delete(other));
    const removedParent = await db.history.retainedStateReference(await latest(db), other);
    await db.transaction((tx) =>
      chronologyAdmission(tx).revisePlacement(placement, {
        parent: removedParent,
        child: childRef,
        order: 'r',
      }),
    );
  }
  await using reopened = await openDatabase({ schema, storage: storage() });
  const placement = (await reopened.entities.calendarChronologyPlacements.first({
    select: { parent: true, child: true, order: true },
  }))!;
  const closure = await readChronologyClosure(reopened, placement.parent);
  expect(closure[0]).toMatchObject({ parentState: 'deleted', childState: 'live', order: 'r' });
  expect(closure[0]!.recordedChild).toMatchObject({ values: { time: date, available: true } });
  const transactions = await reopened.history.transactions.query({
    limit: null,
    select: { sequence: true },
    orderBy: [{ sequence: 'asc' }],
  });
  const originalParent = (await reopened
    .at(transactions[1]!)
    .entities.calendarChronologyPlacements.first({ select: { parent: true } }))!;
  expect(
    (
      await readChronologyClosure(reopened, originalParent.parent, { snapshot: transactions[1] })
    )[0]!.order,
  ).toBe('0zi');
});

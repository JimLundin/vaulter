import { expect, test } from 'vitest';
import {
  createPersistentStorage,
  e,
  openDatabase,
  sameEntity,
  type Journal,
} from '@/core/store/index.ts';
import {
  captureSourceDocument,
  createSourceAssociation,
  insertSourceAssociation,
  readHistoricalSourceAssociation,
  readSourceAssociations,
  reviseSourceAssociation,
  sourceAssociationStatus,
  sourceEntities,
} from './index.ts';

const Page = e.entity('test.association-subject', { title: e.string(), available: e.boolean() });
const schema = e.registry({ ...sourceEntities, pages: Page });
const capture = {
  key: 'external-discussion',
  title: 'External discussion',
  text: 'A captured discussion containing several contributions.',
  origin: 'https://example.com/discussion',
  attribution: 'External source',
  capturedAt: new Date('2026-10-18T12:00:00Z'),
};

test('source associations retain exact endpoints and source placement through independent reopening', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'source-associations-test',
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
    const document = await captureSourceDocument(db, capture);
    const page = await db.transaction((tx) =>
      tx.entities.pages.insert({ title: 'Original place', available: true }),
    );
    const selected = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const source = await db.history.retainedStateReference(selected, document);
    const target = await db.history.retainedStateReference(selected, page);
    const association = await db.transaction((tx) =>
      insertSourceAssociation(tx, {
        key: 'source-place-link',
        role: 'place',
        direction: 'directed',
        source,
        target,
        label: 'Recorded place',
        placement: source,
        placementOrder: 'a0V',
        provenance: [source],
      }),
    );
    const creation = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const address = await db.history.retainedStateReference(creation, association);
    await db.transaction(async (tx) => {
      await tx.entities.sourceDocuments.update({ ...document, text: 'Revised source text' });
      await tx.entities.pages.update({ ...page, title: 'Current place', available: false });
    });
    const deletedPage = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const removedTarget = await db.history.retainedStateReference(deletedPage, page);
    await reviseSourceAssociation(db, association, {
      target: removedTarget,
      label: 'Revised label',
      available: false,
    });
    await createSourceAssociation(db, {
      key: 'selected-original-association',
      role: 'suppliedContext',
      direction: 'directed',
      source: address,
      target,
    });
  }
  const bytes = JSON.stringify(journal);
  await using reopened = await openDatabase({ schema, storage: storage() });
  const associations = await readSourceAssociations(reopened, { includeUnavailable: true });
  const removed = associations.find((value) => value.key === 'source-place-link')!;
  expect(removed).toMatchObject({
    role: 'place',
    direction: 'directed',
    label: 'Revised label',
    placementOrder: 'a0V',
    available: false,
  });
  const selection = associations.find((value) => value.key === 'selected-original-association')!;
  const past = await readHistoricalSourceAssociation(reopened, selection.source!);
  expect(past.recorded).toMatchObject({ label: 'Recorded place', available: true });
  expect(sameEntity(past.recorded!, removed)).toBe(true);
  expect(past.current).toMatchObject({ label: 'Revised label', available: false });
  const originalTarget = await reopened.history.resolveRetainedState(past.recorded!.target!);
  expect(
    await reopened.history.inspect(originalTarget.transaction, originalTarget.entity),
  ).toMatchObject({
    values: { title: 'Original place', available: true },
  });
  expect(await reopened.history.resolveRetainedState(removed.target!)).toMatchObject({
    state: 'live',
  });
  const removedSubject = await reopened.history.resolveRetainedState(removed.target!);
  expect(
    await reopened.history.inspect(removedSubject.transaction, removedSubject.entity),
  ).toMatchObject({
    values: { available: false, title: 'Current place' },
  });
  const originalSource = await reopened.history.resolveRetainedState(removed.source!);
  expect(
    await reopened.history.inspect(originalSource.transaction, originalSource.entity),
  ).toMatchObject({
    values: { text: capture.text },
  });
  expect(removed.placement).toEqual(removed.source);
  expect(removed.provenance).toEqual([removed.source]);
  expect(await readSourceAssociations(reopened)).toHaveLength(1);
  expect(JSON.stringify(journal)).toBe(bytes);
});

test('unrecorded direction remains a candidate even with placement, and clarification retains identity', async () => {
  await using db = await openDatabase({ schema });
  const document = await captureSourceDocument(db, capture);
  const page = await db.transaction((tx) =>
    tx.entities.pages.insert({ title: 'Subject', available: true }),
  );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const placement = await db.history.retainedStateReference(snapshot, document);
  const target = await db.history.retainedStateReference(snapshot, page);
  const association = await createSourceAssociation(db, {
    key: 'unresolved-topic',
    role: 'topic',
    direction: 'unrecorded',
    label: 'Unresolved subject label',
    placement,
  });
  const original = (await readSourceAssociations(db))[0]!;
  expect(original.source).toBeUndefined();
  expect(original.target).toBeUndefined();
  expect(original.placementOrder).toBeUndefined();
  expect(sourceAssociationStatus(original)).toBe('candidate');
  await reviseSourceAssociation(db, association, { source: placement, target });
  expect(sourceAssociationStatus((await readSourceAssociations(db))[0]!)).toBe('candidate');
  await reviseSourceAssociation(db, association, { direction: 'directed' });
  const resolved = (await readSourceAssociations(db))[0]!;
  expect(sourceAssociationStatus(resolved)).toBe('resolved');
  expect(sameEntity(resolved, original)).toBe(true);
});

test('engine-deleted endpoints stay selectable, while invalid references reject all joined writes', async () => {
  await using db = await openDatabase({ schema });
  await using foreign = await openDatabase({ schema });
  const page = await db.transaction((tx) =>
    tx.entities.pages.insert({ title: 'Removed subject', available: true }),
  );
  await db.transaction((tx) => tx.entities.pages.delete(page));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const target = await db.history.retainedStateReference(snapshot, page);
  await createSourceAssociation(db, {
    key: 'deleted-endpoint',
    role: 'topic',
    direction: 'directed',
    target,
  });
  expect(sourceAssociationStatus((await readSourceAssociations(db))[0]!)).toBe('candidate');
  expect(await db.history.resolveRetainedState(target)).toMatchObject({ state: 'deleted' });
  const document = await captureSourceDocument(foreign, capture);
  const foreignSnapshot = (await foreign.history.transactions.first({ select: {} }))!;
  const source = await foreign.history.retainedStateReference(foreignSnapshot, document);
  await expect(
    db.transaction(async (tx) => {
      await tx.entities.pages.insert({ title: 'Must roll back', available: true });
      return insertSourceAssociation(tx, {
        key: 'foreign',
        role: 'place',
        direction: 'directed',
        source,
        target,
      });
    }),
  ).rejects.toThrow();
  expect(await db.entities.pages.query({ select: {} })).toEqual([]);
  expect(await readSourceAssociations(db)).toHaveLength(1);
  await expect(
    createSourceAssociation(db, {
      key: 'invented-placement',
      role: 'topic',
      direction: 'unrecorded',
      placementOrder: '1',
    }),
  ).rejects.toThrow('requires recorded placement');
});

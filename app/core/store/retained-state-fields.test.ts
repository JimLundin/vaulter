import { expect, test } from 'vitest';
import {
  e,
  openDatabase,
  createPersistentStorage,
  createMemoryStorage,
  parseJournal,
  type Journal,
} from './index.ts';

const Note = e.entity('note', { text: e.string() });
const Link = e.entity('link', {
  state: e.retainedStateRef(),
  related: e.set(e.retainedStateRef()),
  evidence: e.historicalRef().optional(),
});
const schema = e.registry({ notes: Note, links: Link });

test('retained references select live or deleted states without weakening supporting evidence', async () => {
  await using db = await openDatabase({ schema });
  const note = await db.transaction((tx) => tx.entities.notes.insert({ text: 'Original' }));
  const first = (await db.history.transactions.first({ select: {} }))!;
  const live = await db.history.retainedStateReference(first, note);
  const evidence = await db.history.reference(first, note);
  await db.transaction((tx) => tx.entities.notes.update({ ...note, text: 'Revised' }));
  const current = (await db.entities.notes.get(note, { select: {} }))!;
  await db.transaction((tx) => tx.entities.notes.delete(current));
  const removed = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const deleted = await db.history.retainedStateReference(removed, note);
  expect(Object.isFrozen(deleted)).toBe(true);
  expect((await db.history.resolveRetainedState(deleted)).state).toBe('deleted');
  const original = await db.history.resolveRetainedState(live);
  expect(original.state).toBe('live');
  expect(await db.history.inspect(original.transaction, original.entity)).toMatchObject({
    values: { text: 'Original' },
  });
  const saved = await db.transaction((tx) =>
    tx.entities.links.insert({ state: deleted, related: [deleted, live, deleted], evidence }),
  );
  expect(
    await db.entities.links.get(saved, { select: { state: true, related: true } }),
  ).toMatchObject({
    state: deleted,
    related: expect.arrayContaining([deleted, live]),
  });
  expect(
    await db.entities.links.query({
      select: {},
      where: { state: { eq: deleted }, related: { some: { eq: live } } },
    }),
  ).toHaveLength(1);
  await expect(db.history.reference(removed, note)).rejects.toThrow('unavailable');
  await expect(db.history.resolve(deleted)).rejects.toThrow();
  await expect(db.history.resolveRetainedState(evidence)).rejects.toThrow();
  await expect(
    db.transaction((tx) =>
      tx.entities.links.insert({
        state: deleted,
        related: [],
        evidence: { ...evidence, transaction: deleted.transaction },
      }),
    ),
  ).rejects.toThrow('unavailable');
});

test('retained references reject absent, future, foreign and wrong-type addresses before acceptance', async () => {
  const storage = createMemoryStorage();
  await using db = await openDatabase({ schema, storage });
  const earlier = await db.transaction((tx) => tx.entities.notes.insert({ text: 'Earlier' }));
  const before = (await db.history.transactions.first({ select: {} }))!;
  const later = await db.transaction((tx) => tx.entities.notes.insert({ text: 'Later' }));
  const after = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const address = await db.history.retainedStateReference(after, later);
  const beforeAddress = await db.history.retainedStateReference(before, earlier);
  await expect(db.history.retainedStateReference(before, later)).rejects.toThrow('unavailable');
  const invalid = [
    { ...address, entity: 'missing' },
    { ...address, transaction: beforeAddress.transaction },
    { ...address, transaction: 'unaccepted' },
    { ...address, type: 'link' },
    { ...address, scope: 'foreign' },
    { ...address, journal: 'foreign' },
  ];
  for (const value of invalid) {
    await expect(db.history.resolveRetainedState(value)).rejects.toThrow();
    await expect(
      db.transaction((tx) => tx.entities.links.insert({ state: value, related: [] })),
    ).rejects.toThrow();
  }
  await using foreign = await openDatabase({ schema });
  await expect(foreign.history.retainedStateReference(before, earlier)).rejects.toThrow();
  await expect(
    db.transaction(async (tx) => {
      const pending = await tx.entities.notes.insert({ text: 'Unaccepted' });
      await db.history.retainedStateReference(after, pending);
    }),
  ).rejects.toThrow('unavailable');
  expect(await db.entities.links.query({ select: {} })).toEqual([]);
});

test('durable replay validates retained state format, cutoff, type and scope on independent reopen', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = (scope = 'retained-fields') =>
    createPersistentStorage({
      scope,
      load: () => Promise.resolve(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  await using db = await openDatabase({ schema, storage: storage() });
  const note = await db.transaction((tx) => tx.entities.notes.insert({ text: 'Retained' }));
  const first = (await db.history.transactions.first({ select: {} }))!;
  const live = await db.history.retainedStateReference(first, note);
  await db.transaction((tx) => tx.entities.notes.delete(note));
  const removed = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const deleted = await db.history.retainedStateReference(removed, note);
  await db.transaction((tx) => tx.entities.links.insert({ state: deleted, related: [live] }));
  await using reopened = await openDatabase({ schema, storage: storage() });
  const saved = (await reopened.entities.links.first({ select: { state: true, related: true } }))!;
  expect(saved.state).toEqual(deleted);
  expect(
    (await reopened.history.resolveRetainedState(JSON.parse(JSON.stringify(saved.state)))).state,
  ).toBe('deleted');
  const original = await reopened.history.resolveRetainedState(saved.related[0]);
  expect(await reopened.history.inspect(original.transaction, original.entity)).toMatchObject({
    values: { text: 'Retained' },
  });
  await expect(openDatabase({ schema, storage: storage('another-scope') })).rejects.toThrow();
  expect(parseJournal(journal, { scope: 'retained-fields' })).toEqual(journal);
  const receipt = journal.commits.at(-1)!;
  for (const patch of [
    { entity: 'missing' },
    { transaction: receipt.id },
    { transaction: 'future' },
    { type: 'link' },
    { journal: 'wrong' },
    { scope: 'wrong' },
    { format: 'vaulter-eav-snapshot-v1' },
    { unexpected: true },
  ]) {
    const corrupted = structuredClone(journal);
    const fact = corrupted.commits.at(-1)!.facts.find((item) => item.attribute === 'link/state')!;
    if (typeof fact.value !== 'object' || !('history' in fact.value))
      throw new Error('Expected address');
    Object.assign(fact.value, {
      history: JSON.stringify(
        Object.fromEntries(
          Object.entries({ ...deleted, ...patch }).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    });
    expect(() => parseJournal(corrupted, { scope: 'retained-fields' })).toThrow();
  }
  const wrongKind = structuredClone(journal);
  const attribute = wrongKind.schemas[0]!.schema.find(
    (type) => type.name === 'link',
  )!.attributes.find((field) => field.name === 'state')!;
  Object.assign(attribute, { kind: 'historical' });
  expect(() => parseJournal(wrongKind)).toThrow();
});

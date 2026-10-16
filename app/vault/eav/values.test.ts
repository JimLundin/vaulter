import { expect, test } from 'vitest';
import { e, openDatabase, createMemoryStorage, sameEntity, SchemaMismatchError } from './index.ts';

const Document = e.entity('document', { payload: e.json() });
const schema = e.registry({ documents: Document });

test('JSON is detached, deeply immutable and retained through replacement and historical get', async () => {
  const storage = createMemoryStorage();
  await using db = await openDatabase({ schema, storage });
  const payload = { order: ['b', 'a', 'b'], nested: { value: 1 }, empty: null };
  const entity = await db.transaction((tx) => tx.entities.documents.insert({ payload }));
  const initial = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  payload.nested.value = 7;
  expect(entity.payload).toEqual({ order: ['b', 'a', 'b'], nested: { value: 1 }, empty: null });
  expect(Object.isFrozen(entity.payload)).toBe(true);
  expect(Object.isFrozen(Reflect.get(Object(entity.payload), 'nested'))).toBe(true);
  await db.transaction((tx) =>
    tx.entities.documents.update({ ...entity, payload: { answer: true } }),
  );
  expect(
    await db.at(initial).entities.documents.get(entity, { select: { payload: true } }),
  ).toMatchObject({ payload: { nested: { value: 1 } } });
  expect(await db.entities.documents.get(entity, { select: { payload: true } })).toMatchObject({
    payload: { answer: true },
  });
  await using reopened = await openDatabase({ schema, storage });
  const projected = (await reopened.entities.documents.get(entity, { select: {} }))!;
  expect(sameEntity(projected, entity)).toBe(true);
  await reopened.transaction(async (tx) => {
    await tx.entities.documents.delete(projected);
    expect(await tx.entities.documents.get(projected, { select: {} })).toBeUndefined();
  });
  expect(await db.entities.documents.get(projected, { select: {} })).toBeUndefined();
  expect(await db.at(initial).entities.documents.get(projected, { select: {} })).toBeDefined();
});

test('JSON equality ignores object key order, preserves array order and never acts as a reference', async () => {
  await using db = await openDatabase({ schema });
  const payload = { ref: 'missing', type: 'document', nested: { b: 2, a: 1 } };
  const document = await db.transaction((tx) => tx.entities.documents.insert({ payload }));
  await db.transaction((tx) =>
    tx.entities.documents.update({
      ...document,
      payload: { nested: { a: 1, b: 2 }, type: 'document', ref: 'missing' },
    }),
  );
  expect(await db.history.transactions.query({ select: {} })).toHaveLength(1);
  expect(
    await db.entities.documents.first({ select: {}, where: { payload: { eq: payload } } }),
  ).toBeDefined();
  await expect(
    invoke(db.entities.documents, 'query', [{ select: {}, orderBy: [{ payload: 'asc' }] }]),
  ).rejects.toThrow('Cannot order');
});

test('invalid JSON aborts all writes without lossy serialization', async () => {
  await using db = await openDatabase({ schema });
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  const entity = await db.transaction((tx) => tx.entities.documents.insert({ payload: null }));
  const invalid = [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    () => {},
    new Date(),
    new Map(),
    { value: undefined },
    // biome-ignore lint/suspicious/noSparseArray: Verify that lossy sparse JSON arrays are rejected.
    [, 1],
    cycle,
    entity,
    Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        throw new Error('Getter executed');
      },
    }),
  ];
  for (const payload of invalid) {
    await expect(
      db.transaction(async (tx) => {
        await tx.entities.documents.insert({ payload: 'should roll back' });
        await Reflect.apply(tx.entities.documents.insert, undefined, [{ payload }]);
      }),
    ).rejects.toThrow();
  }
  expect(await db.entities.documents.query({ select: {} })).toHaveLength(1);
});

test('get validates identity and selection even when the entity is absent', async () => {
  await using db = await openDatabase({ schema });
  const entity = await db.transaction((tx) => tx.entities.documents.insert({ payload: true }));
  await using other = await openDatabase({ schema });
  await expect(other.entities.documents.get(entity, { select: {} })).rejects.toThrow();
  await expect(
    Reflect.apply(db.entities.documents.get, undefined, [{}, { select: {} }]),
  ).rejects.toThrow();
  await db.transaction((tx) => tx.entities.documents.delete(entity));
  await expect(
    Reflect.apply(db.entities.documents.get, undefined, [entity, { select: { missing: true } }]),
  ).rejects.toThrow('Unknown');
});

test('JSON is part of persisted schema compatibility', async () => {
  const storage = createMemoryStorage();
  await using db = await openDatabase({ schema, storage });
  await db.transaction((tx) => tx.entities.documents.insert({ payload: { temperature: 0.5 } }));
  await expect(
    openDatabase({
      storage,
      schema: e.registry({ documents: e.entity('document', { payload: e.string() }) }),
    }),
  ).rejects.toBeInstanceOf(SchemaMismatchError);
});

function invoke(target: object, method: string, args: unknown[]): Promise<unknown> {
  const operation: unknown = Reflect.get(target, method);
  if (typeof operation !== 'function') throw new Error('Missing method');
  return Reflect.apply(operation, target, args);
}

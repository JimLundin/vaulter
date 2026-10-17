import { expect, test } from 'vitest';
import { DEFAULT_QUERY_LIMIT, e, openDatabase, sameEntity, type EntityRef } from './index.ts';

const Item = e.entity('limit-item', {
  rank: e.number(),
  group: e.string(),
  optional: e.number().optional(),
});
const schema = e.registry({ items: Item });

async function populate(
  db: Awaited<ReturnType<typeof openDatabase<typeof schema>>>,
  count: number,
) {
  await db.transaction(async (tx) => {
    for (let rank = count - 1; rank >= 0; rank--)
      await tx.entities.items.insert({
        rank,
        group: String(rank % 3),
        ...(rank % 2 ? { optional: rank % 5 } : {}),
      });
    expect(await tx.entities.items.query({ select: {} })).toHaveLength(
      Math.min(count, DEFAULT_QUERY_LIMIT),
    );
  });
}

test('live, pending and historical entity queries default to 100 while explicit limits and complete receipts remain available', async () => {
  await using db = await openDatabase({ schema });
  await populate(db, 137);
  const options = { select: { rank: true }, orderBy: [{ rank: 'asc' }] } as const;
  const limited = await db.entities.items.query(options);
  expect(DEFAULT_QUERY_LIMIT).toBe(100);
  expect(limited.map((row) => row.rank)).toEqual(Array.from({ length: 100 }, (_, i) => i));
  expect(await db.entities.items.query({ ...options, limit: 0 })).toEqual([]);
  expect(await db.entities.items.query({ ...options, limit: 125 })).toHaveLength(125);
  expect(await db.entities.items.query({ ...options, limit: null })).toHaveLength(137);
  expect(await db.entities.items.first(options)).toMatchObject({ rank: 0 });
  const transaction = (await db.history.transactions.first({ select: {} }))!;
  expect(await db.at(transaction).entities.items.query(options)).toHaveLength(100);
  expect(await db.history.entities.items.query({ select: { entity: true } })).toHaveLength(100);
  expect(
    await db.history.entities.items.query({ select: { entity: true }, limit: 125 }),
  ).toHaveLength(125);
  expect(
    await db.history.entities.items.query({ select: { entity: true }, limit: null }),
  ).toHaveLength(137);
  expect(await db.history.changes(transaction)).toHaveLength(137);
});

test('bounded ordering and cursor pages preserve every match, including ties and missing values', async () => {
  await using db = await openDatabase({ schema });
  await populate(db, 137);
  for (const orderBy of [
    [],
    [{ rank: 'asc' }],
    [{ rank: 'desc' }],
    [{ group: 'desc' }, { optional: 'asc' }],
    [{ optional: 'desc' }, { group: 'asc' }],
  ] as const) {
    const options = { select: { rank: true }, where: { rank: { gte: 7 } }, orderBy } as const;
    const complete = await db.entities.items.query({ ...options, limit: null });
    expect(
      (await db.entities.items.query({ ...options, limit: 13 })).map((row) => row.rank),
    ).toEqual(complete.slice(0, 13).map((row) => row.rank));
    const ranks: number[] = [];
    let after: EntityRef<typeof Item> | undefined;
    for (;;) {
      const page = await db.entities.items.query({ ...options, limit: 13, after });
      ranks.push(...page.map((row) => row.rank));
      if (page.length < 13) break;
      after = page.at(-1)!;
    }
    expect(ranks).toEqual(complete.map((row) => row.rank));
  }
});

test('transaction and entity history queries apply the same default and support explicit complete reads', async () => {
  await using db = await openDatabase({ schema });
  for (let rank = 0; rank < 105; rank++)
    await db.transaction((tx) => tx.entities.items.insert({ rank, group: 'history' }));
  const options = { select: { sequence: true }, orderBy: [{ sequence: 'desc' }] } as const;
  expect((await db.history.transactions.query(options)).map((row) => row.sequence)).toEqual(
    Array.from({ length: 100 }, (_, i) => 105 - i),
  );
  expect(await db.history.transactions.query({ ...options, limit: null })).toHaveLength(105);
  expect(await db.history.transactions.query({ ...options, limit: 102 })).toHaveLength(102);
  expect(await db.history.transactions.query({ ...options, limit: 0 })).toEqual([]);
  expect(await db.history.transactions.first(options)).toMatchObject({ sequence: 105 });
  expect(await db.history.entities.items.query(options)).toHaveLength(100);
  expect(await db.history.entities.items.query({ ...options, limit: null })).toHaveLength(105);
  expect(await db.history.entities.items.query({ ...options, limit: 0 })).toEqual([]);
});

test('invalid limits reject even on empty collections and first owns its limit', async () => {
  await using db = await openDatabase({ schema });
  const readers = [db.entities.items, db.history.transactions, db.history.entities.items];
  const invoke = (reader: object, method: string, options: unknown): Promise<unknown> =>
    Reflect.apply(Reflect.get(reader, method), reader, [options]);
  for (const reader of readers) {
    for (const limit of [
      -1,
      1.5,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
      '100',
      false,
    ])
      await expect(invoke(reader, 'query', { select: {}, limit })).rejects.toThrow('Query limit');
    await expect(invoke(reader, 'first', { select: {}, limit: null })).rejects.toThrow();
  }
});

test('large reads allow event-loop work and retain their captured snapshot during publication', async () => {
  await using db = await openDatabase({ schema });
  await populate(db, 600);
  const current = (await db.entities.items.first({
    select: { rank: true },
    orderBy: [{ rank: 'asc' }],
  }))!;
  let progressed = false;
  const update = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      progressed = true;
      db.transaction((tx) => tx.entities.items.update({ ...current, rank: -1 })).then(
        () => resolve(),
        reject,
      );
    }, 0);
  });
  const results = await db.entities.items.query({
    select: { rank: true },
    orderBy: [{ rank: 'asc' }],
  });
  expect(progressed).toBe(true);
  expect(results[0].rank).toBe(0);
  expect(sameEntity(results[0], current)).toBe(true);
  await update;
  expect(await db.entities.items.get(current, { select: { rank: true } })).toMatchObject({
    rank: -1,
  });
});

test('disposal rejects a large query that has yielded', async () => {
  const db = await openDatabase({ schema });
  try {
    await populate(db, 600);
    const closed = new Promise<void>((resolve) =>
      setTimeout(() => {
        void db[Symbol.asyncDispose]().then(resolve);
      }, 0),
    );
    await expect(db.entities.items.query({ select: {} })).rejects.toThrow('closed');
    await closed;
  } finally {
    await db[Symbol.asyncDispose]();
  }
});

test('a pending read cannot escape a successfully closed transaction', async () => {
  await using db = await openDatabase({ schema });
  await populate(db, 600);
  let pending: Promise<unknown> | undefined;
  await db.transaction((tx) => {
    pending = tx.entities.items.query({ select: {} });
    return Promise.resolve();
  });
  await expect(pending).rejects.toThrow('closed');
});

test('a top-level limit preserves complete selected sets and inverse relationships', async () => {
  const Parent = e.entity('limit-parent', { name: e.string(), values: e.set(e.number()) });
  const Child = e.entity('limit-child', { parent: e.ref(Parent), rank: e.number() });
  await using db = await openDatabase({
    schema: e.registry({
      parents: Parent.extend({ children: e.inverse(Child, 'parent') }),
      children: Child,
    }),
  });
  await db.transaction(async (tx) => {
    const parent = await tx.entities.parents.insert({
      name: 'Complete',
      values: Array.from({ length: 125 }, (_, i) => i),
    });
    for (let rank = 0; rank < 125; rank++) await tx.entities.children.insert({ parent, rank });
  });
  const rows = await db.entities.parents.query({
    select: { values: true, children: { rank: true } },
    limit: 1,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].values).toHaveLength(125);
  expect(rows[0].children).toHaveLength(125);
});

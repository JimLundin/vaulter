// Records: what storage keeps, and how.
import { expect, it } from 'vitest';
import { startApp } from '../../app.ts';

/** A collection of `T`, on a freshly started store. */
const use = async <T>(name = 'test/thing') => {
  await startApp(['storage']);
  return (await import('#extensions/storage')).collection<T>(name);
};

it('keeps what it is given, with when and which revision', async () => {
  const people = await use<{ name: string; age?: number }>('test/person');
  const p = await people.create({ name: 'Ada' });
  expect([
    p.name,
    p.meta.collection,
    p.meta.rev,
    p.meta.created === p.meta.updated,
  ]).toEqual(['Ada', 'test/person', 1, true]);
  expect(Object.keys(p).sort((a, b) => a.localeCompare(b))).toEqual([
    'id',
    'meta',
    'name',
  ]);
  expect(await people.get(p.id)).toEqual(p);
  expect(await people.get('nope')).toEqual(undefined);
});

it('creates a record with a chosen id once, and refuses that id again', async () => {
  const things = await use<{ n: number }>();
  const a = await things.create({ id: 'one', n: 1 });
  expect(a.id).toEqual('one');
  await expect(things.create({ id: 'one', n: 2 })).rejects.toThrow();
  expect((await things.get('one'))?.n).toEqual(1);
});

it('updates a record as a new revision, keeping when it was created', async () => {
  const things = await use<{ n: number }>();
  const a = await things.create({ n: 1 });
  const b = await things.update(a.id, (cur) => ({ n: cur.n + 1 }));
  expect([b.id, b.n, b.meta.rev, b.meta.created]).toEqual([
    a.id,
    2,
    2,
    a.meta.created,
  ]);
  expect((await things.query()).length).toEqual(1);
});

it('loses neither of two updates made at once', async () => {
  const counters = await use<{ n: number; by: string[] }>();
  const c = await counters.create({ n: 0, by: [] });
  const slow = (who: string) =>
    counters.update(c.id, async (cur) => {
      await new Promise((ok) => setTimeout(ok, 5));
      return { n: cur.n + 1, by: [...cur.by, who] };
    });
  await Promise.all([slow('a'), slow('b')]);
  const now = await counters.get(c.id);
  expect([now?.n, [...(now?.by ?? [])].sort(), now?.meta.rev]).toEqual([
    2,
    ['a', 'b'],
    3,
  ]);
});

it("queries by a field's value or range, ordered by a field or when, up to a limit", async () => {
  const events = await use<{ n: number; kind: string; at?: string }>();
  for (const [n, kind, at] of [
    [1, 'run', '2026-01-01'],
    [2, 'swim', undefined],
    [3, 'run', '2026-03-01'],
  ] as const) {
    await events.create({ n, kind, ...(at ? { at } : {}) });
  }
  const ns = (list: { n: number }[]) => list.map((x) => x.n);
  expect(ns(await events.query())).toEqual([3, 2, 1]);
  expect(
    ns(await events.query({ where: { kind: 'run' }, order: 'asc' })),
  ).toEqual([1, 3]);
  expect(
    ns(
      await events.query({
        where: { at: { gte: '2026-01-01', lt: '2026-02-01' } },
      }),
    ),
  ).toEqual([1]);
  expect(
    ns(await events.query({ orderBy: 'n', order: 'asc', limit: 2 })),
  ).toEqual([1, 2]);
  // Without the field ordered by: last, in either order.
  expect(ns(await events.query({ orderBy: 'at' }))).toEqual([3, 1, 2]);
  expect(ns(await events.query({ orderBy: 'at', order: 'asc' }))).toEqual([
    1, 3, 2,
  ]);
});

it('finds records by the words in their text fields, or in the fields asked for', async () => {
  const places = await use<{ name: string; aliases: string[]; notes?: string }>(
    'test/place',
  );
  await places.create({
    name: 'Café Lumière',
    aliases: ['Lumière'],
    notes: 'Södermalm',
  });
  await places.create({
    name: 'The library',
    aliases: [],
    notes: 'near the café',
  });
  const names = (list: { name: string }[]) => list.map((x) => x.name);
  expect(names(await places.search('café söder'))).toEqual(['Café Lumière']);
  expect(
    names(await places.search('café', { fields: ['name', 'aliases'] })),
  ).toEqual(['Café Lumière']);
  expect(names(await places.search('café'))).toEqual([
    'The library',
    'Café Lumière',
  ]);
  // Not the metadata: every record has a collection and an id.
  expect(await places.search('test')).toEqual([]);
});

it('deletes to a hidden tombstone', async () => {
  const scraps = await use<{ text: string }>();
  const a = await scraps.create({ text: 'keep me' });
  await scraps.delete(a.id);
  expect(await scraps.get(a.id)).toEqual(undefined);
  expect(await scraps.query()).toEqual([]);
  expect(await scraps.search('keep')).toEqual([]);
});

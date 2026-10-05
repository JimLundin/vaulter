// Records: what storage keeps, and how.
import { expect, it } from 'vitest';
import { z } from 'zod';
import { startApp } from '../../app.ts';

/** Records as a fresh caller has them, on a freshly started store. */
const use = async () => {
  await startApp(['storage']);
  return (await import('#extensions/storage')).recordsFor('test');
};

it('registers a type in the caller’s namespace and checks values against it', async () => {
  const r = await use();
  const person = await r.registerType('person', {
    name: z.string(),
    age: z.number().optional(),
  });
  expect(/^[\w~-]+\/person$/.test(person.name), `namespaced: ${person.name}`).toBeTruthy();
  const p = await r.create(person, { name: 'Ada' });
  expect([p.name, p.meta.type, p.meta.rev, p.meta.created === p.meta.updated]).toEqual([
    'Ada',
    person.name,
    1,
    true,
  ]);
  expect(Object.keys(p).sort((a, b) => a.localeCompare(b))).toEqual(['id', 'meta', 'name']);
  await expect(r.create(person, { name: 1 } as never)).rejects.toThrow();
  expect(await r.get(person, p.id)).toEqual(p);
  expect(await r.get(person, 'nope')).toEqual(undefined);
});
it('creates a record with a chosen id once, and refuses that id again', async () => {
  const r = await use();
  const thing = await r.registerType('thing', { n: z.number() });
  const a = await r.create(thing, { id: 'one', n: 1 });
  expect(a.id).toEqual('one');
  await expect(r.create(thing, { id: 'one', n: 2 })).rejects.toThrow();
  expect((await r.get(thing, 'one'))?.n).toEqual(1);
});
it('updates a record as a new revision, keeping when it was created', async () => {
  const r = await use();
  const thing = await r.registerType('thing', { n: z.number() });
  const a = await r.create(thing, { n: 1 });
  const b = await r.update(thing, a.id, (cur) => ({ n: cur.n + 1 }));
  expect([b.id, b.n, b.meta.rev, b.meta.created]).toEqual([a.id, 2, 2, a.meta.created]);
  expect((await r.query(thing)).length).toEqual(1);
});
it('loses neither of two updates made at once', async () => {
  const r = await use();
  const counter = await r.registerType('counter', { n: z.number(), by: z.array(z.string()) });
  const c = await r.create(counter, { n: 0, by: [] });
  const slow = (who: string) =>
    r.update(counter, c.id, async (cur) => {
      await new Promise((ok) => setTimeout(ok, 5));
      return { n: cur.n + 1, by: [...cur.by, who] };
    });
  await Promise.all([slow('a'), slow('b')]);
  const now = await r.get(counter, c.id);
  expect([now?.n, [...(now?.by ?? [])].sort(), now?.meta.rev]).toEqual([2, ['a', 'b'], 3]);
});
it("queries by a field's value or range, ordered by a field or when, up to a limit", async () => {
  const r = await use();
  const ev = await r.registerType('event', {
    n: z.number(),
    kind: z.string(),
    at: z.string().optional(),
  });
  for (const [n, kind, at] of [
    [1, 'run', '2026-01-01'],
    [2, 'swim', undefined],
    [3, 'run', '2026-03-01'],
  ] as const)
    await r.create(ev, { n, kind, ...(at ? { at } : {}) });
  expect((await r.query(ev)).map((x) => x.n)).toEqual([3, 2, 1]);
  expect((await r.query(ev, { where: { kind: 'run' }, order: 'asc' })).map((x) => x.n)).toEqual([
    1, 3,
  ]);
  expect(
    (await r.query(ev, { where: { at: { gte: '2026-01-01', lt: '2026-02-01' } } })).map((x) => x.n),
  ).toEqual([1]);
  expect((await r.query(ev, { orderBy: 'n', order: 'asc', limit: 2 })).map((x) => x.n)).toEqual([
    1, 2,
  ]);
  // Without the field ordered by: last, in either order.
  expect((await r.query(ev, { orderBy: 'at' })).map((x) => x.n)).toEqual([3, 1, 2]);
  expect((await r.query(ev, { orderBy: 'at', order: 'asc' })).map((x) => x.n)).toEqual([1, 3, 2]);
});
it('finds records by the words in their text fields, or in the fields asked for', async () => {
  const r = await use();
  const place = await r.registerType('place', {
    name: z.string(),
    aliases: z.array(z.string()),
    notes: z.string().optional(),
  });
  await r.create(place, { name: 'Café Lumière', aliases: ['Lumière'], notes: 'Södermalm' });
  await r.create(place, { name: 'The library', aliases: [], notes: 'near the café' });
  expect((await r.search([place], 'café söder')).map((x) => x.name)).toEqual(['Café Lumière']);
  expect(
    (await r.search([place], 'café', { fields: ['name', 'aliases'] })).map((x) => x.name),
  ).toEqual(['Café Lumière']);
  expect((await r.search([place], 'café')).map((x) => x.name)).toEqual([
    'The library',
    'Café Lumière',
  ]);
  // Not the metadata: every record has a type and an id.
  expect(await r.search([place], place.name.split('/')[0])).toEqual([]);
});
it('deletes to a hidden tombstone', async () => {
  const r = await use();
  const note = await r.registerType('scrap', { text: z.string() });
  const a = await r.create(note, { text: 'keep me' });
  await r.delete(note, a.id);
  expect(await r.get(note, a.id)).toEqual(undefined);
  expect(await r.query(note)).toEqual([]);
  expect(await r.search([note], 'keep')).toEqual([]);
});
it('refuses writes to another extension’s type', async () => {
  const r = await use();
  const foreign = { kind: 'record-type', name: 'someone-else/secret' } as const;
  await expect(r.create(foreign, {})).rejects.toThrow();
});

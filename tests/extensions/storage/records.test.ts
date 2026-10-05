// Records: what storage keeps, and how.
import { expect, it } from 'vitest';
import { startApp } from '../../app.ts';

/** A collection of `T`, on a freshly started store. */
async function use<T extends object>(name = 'test/thing') {
    await startApp(['storage']);
    return (await import('#extensions/storage')).collection<T>(name);
}

it('keeps what it is given, with when and which revision', async () => {
    const people = await use<{ name: string; age?: number }>('test/person');
    const ada = await people.create({ name: 'Ada' });
    expect([
        ada.name,
        ada.meta.collection,
        ada.meta.rev,
        ada.meta.created === ada.meta.updated,
    ]).toEqual(['Ada', 'test/person', 1, true]);
    expect(
        Object.keys(ada).sort((first, second) => first.localeCompare(second)),
    ).toEqual(['id', 'meta', 'name']);
    expect(await people.get(ada.id)).toEqual(ada);
    expect(await people.get('nope')).toEqual(undefined);
});

it('creates a record with a chosen id, once', async () => {
    const things = await use<{ n: number }>();
    const first = await things.create({ id: 'one', n: 1 });
    expect(first.id).toEqual('one');
    await expect(things.create({ id: 'one', n: 2 })).rejects.toThrow();
    expect((await things.get('one'))?.n).toEqual(1);
});

it('updates a record as a new revision', async () => {
    const things = await use<{ n: number }>();
    const first = await things.create({ n: 1 });
    const second = await things.update(first.id, (cur) => ({ n: cur.n + 1 }));
    expect([second.id, second.n, second.meta.rev, second.meta.created]).toEqual(
        [first.id, 2, 2, first.meta.created],
    );
    expect((await things.query()).length).toEqual(1);
});

it('loses neither of two updates made at once', async () => {
    const counters = await use<{ n: number; by: string[] }>();
    const counter = await counters.create({ n: 0, by: [] });
    const slow = (who: string) =>
        counters.update(counter.id, async (cur) => {
            await new Promise((ok) => setTimeout(ok, 5));
            return { n: cur.n + 1, by: [...cur.by, who] };
        });
    await Promise.all([slow('a'), slow('b')]);
    const now = await counters.get(counter.id);
    expect([now?.n, [...(now?.by ?? [])].sort(), now?.meta.rev]).toEqual([
        2,
        ['a', 'b'],
        3,
    ]);
});

it('queries by value or range, ordered, up to a limit', async () => {
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

it('finds records by the words in their text', async () => {
    const places = await use<{
        name: string;
        aliases: string[];
        notes?: string;
    }>('test/place');
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
    const first = await scraps.create({ text: 'keep me' });
    await scraps.delete(first.id);
    expect(await scraps.get(first.id)).toEqual(undefined);
    expect(await scraps.query()).toEqual([]);
    expect(await scraps.search('keep')).toEqual([]);
});

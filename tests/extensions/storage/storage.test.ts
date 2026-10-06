// Storage: what it keeps, and how, as its users rely on it.
import { expect, it } from 'vitest';
import { z } from 'zod';
import { restart } from '../../app.ts';

/** A collection of what `schema` checks, on a freshly started page. */
async function use<Schema extends z.ZodObject>(
    schema: Schema,
    indexes: (keyof z.output<Schema> & string)[] = [],
) {
    restart();
    const { collection } = await import('#extensions/storage');
    return collection('test/thing', schema, indexes);
}

const Person = z.object({ name: z.string() });
const Numbered = z.object({ n: z.number() });

it('keeps what it is given, by id', async () => {
    const people = await use(Person);
    const ada = await people.create({ name: 'Ada' });
    expect(await people.get({ id: ada.id })).toEqual(ada);
    expect(await people.get({ id: 'nope' })).toBeUndefined();

    // A new start reads it back.
    const again = await use(Person);
    expect(await again.get({ id: ada.id })).toEqual(ada);
});

it('checks what it keeps against its schema', async () => {
    const people = await use(Person);
    // What came in untyped, as from the model or a fetch.
    const wrong = JSON.parse('{ "name": 3 }');
    await expect(people.create(wrong)).rejects.toThrow();
    const ada = await people.create({ name: 'Ada' });
    await expect(
        people.update({ id: ada.id, change: () => wrong }),
    ).rejects.toThrow();
    expect((await people.get({ id: ada.id }))?.name).toBe('Ada');
});

it('creates a record with a chosen id, once', async () => {
    const things = await use(Numbered);
    await things.create({ id: 'one', n: 1 });
    await expect(things.create({ id: 'one', n: 2 })).rejects.toThrow();
    expect((await things.get({ id: 'one' }))?.n).toBe(1);
});

it('loses neither of two updates made at once', async () => {
    const counters = await use(z.object({ by: z.array(z.string()) }));
    const counter = await counters.create({ by: [] });
    await Promise.all(
        ['a', 'b'].map((who) =>
            counters.update({
                id: counter.id,
                change: (now) => ({ by: [...now.by, who] }),
            }),
        ),
    );
    expect((await counters.get({ id: counter.id }))?.by.sort()).toEqual([
        'a',
        'b',
    ]);
    await expect(
        counters.update({ id: 'nope', change: (now) => now }),
    ).rejects.toThrow();
});

it('queries by value or range, ordered, up to a limit', async () => {
    const events = await use(
        z.object({ n: z.number(), kind: z.string(), at: z.string() }),
        ['at'],
    );
    for (const [n, kind, at] of [
        [1, 'run', '2026-01-01'],
        [2, 'swim', '2026-02-01'],
        [3, 'run', '2026-03-01'],
    ] as const) {
        await events.create({ n, kind, at });
    }
    const ns = (list: { n: number }[]) => list.map((event) => event.n);
    expect(ns(await events.query({ orderBy: 'at' }))).toEqual([1, 2, 3]);
    expect(
        ns(await events.query({ where: { kind: 'run' }, orderBy: 'at' })),
    ).toEqual([1, 3]);
    expect(
        ns(
            await events.query({
                where: { at: { gte: '2026-02-01', lt: '2026-03-01' } },
            }),
        ),
    ).toEqual([2]);
    expect(
        ns(await events.query({ orderBy: 'at', order: 'desc', limit: 2 })),
    ).toEqual([3, 2]);
    // Only by one of its indexes.
    await expect(
        events.query({ orderBy: JSON.parse('"n"') }),
    ).rejects.toThrow();
});

it('puts and deletes', async () => {
    const things = await use(Numbered);
    await things.put({ id: 'one', n: 1 });
    await things.put({ id: 'one', n: 2 });
    expect((await things.get({ id: 'one' }))?.n).toBe(2);
    await things.delete({ id: 'one' });
    expect(await things.query({})).toEqual([]);
});

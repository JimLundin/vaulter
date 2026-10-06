import { expect, it } from 'vitest';
import { restart } from '../../app.ts';

/** The wiki started, with the notes its facts cite. */
async function start() {
    restart();
    return {
        log: (await import('#extensions/notes')).notes,
        pages: (await import('#extensions/wiki')).wiki,
    };
}

it('keeps pages, found by name or alias, with facts citing notes', async () => {
    const { log, pages } = await start();
    const note = await log.append({ text: 'Lunch with Ada at Café Lumière' });
    const ada = await pages.create({
        kind: 'person',
        name: 'Ada',
        summary: 'A friend.',
    });
    const cafe = await pages.create({
        kind: 'place',
        name: 'Café Lumière',
        aliases: ['Lumière'],
        area: 'Södermalm',
    });
    expect(cafe).toMatchObject({ kind: 'place', area: 'Södermalm', facts: [] });
    await pages.addFact({
        id: ada.id,
        text: 'Had lunch at Café Lumière',
        sources: [note.id],
    });

    // A list gives pages in brief: the page itself has the facts.
    expect(await pages.find({ query: 'Ada', kinds: ['person'] })).toMatchObject(
        [{ kind: 'person', name: 'Ada', summary: 'A friend.' }],
    );
    expect((await pages.find({ query: 'lumière' })).map((e) => e.name)).toEqual(
        ['Café Lumière'],
    );
    const page = await pages.get({ id: ada.id });
    expect(page?.facts.map((f) => [f.text, f.sources])).toEqual([
        ['Had lunch at Café Lumière', [note.id]],
    ]);
    expect(
        (await pages.citing({ noteId: note.id })).map((e) => e.name),
    ).toEqual(['Ada']);

    // A fact cites at least one note.
    await expect(
        pages.addFact({ id: ada.id, text: 'Uncited', sources: [] }),
    ).rejects.toThrow();
});

it('changes a page, and takes a wrong fact off it', async () => {
    const { log, pages } = await start();
    const note = await log.append({ text: 'Ada was born in December' });
    const ada = await pages.create({ kind: 'person', name: 'Ada' });
    const changed = await pages.update({
        id: ada.id,
        patch: { birthday: '12-10', aliases: ['Ada L.'] },
    });
    expect([changed.birthday, changed.aliases]).toEqual(['12-10', ['Ada L.']]);

    const withFact = await pages.addFact({
        id: ada.id,
        text: 'Born in November',
        sources: [note.id],
    });
    const [wrong] = withFact.facts;
    const retracted = await pages.retractFact({ id: ada.id, factId: wrong.id });
    expect(retracted.facts).toEqual([]);
});

it('keeps two facts added at once', async () => {
    const { log, pages } = await start();
    const note = await log.append({ text: 'Ada swims on Sundays' });
    const ada = await pages.create({ kind: 'person', name: 'Ada' });
    await Promise.all([
        pages.addFact({ id: ada.id, text: 'Swims', sources: [note.id] }),
        pages.addFact({ id: ada.id, text: 'On Sundays', sources: [note.id] }),
    ]);
    expect(
        (await pages.get({ id: ada.id }))?.facts.map((f) => f.text).sort(),
    ).toEqual(['On Sundays', 'Swims']);
});

it('merges pages: facts and names fold together, and links follow', async () => {
    const { log, pages } = await start();
    const note = await log.append({ text: 'Ada works in Uppsala' });
    const ada = await pages.create({ kind: 'person', name: 'Ada Lovelace' });
    const dup = await pages.create({ kind: 'person', name: 'Ada' });
    await pages.addFact({
        id: dup.id,
        text: 'Works in Uppsala',
        sources: [note.id],
    });
    const trip = await pages.create({
        kind: 'event',
        name: 'Trip',
        people: [dup.id],
    });

    const merged = await pages.merge({ keep: ada.id, merge: dup.id });
    expect(merged.aliases).toEqual(['Ada']);
    expect(merged.facts.map((f) => f.text)).toEqual(['Works in Uppsala']);
    expect(await pages.get({ id: dup.id })).toBeUndefined();
    expect((await pages.get({ id: trip.id }))?.people).toEqual([ada.id]);
    expect((await pages.find({ query: 'ada' })).map((e) => e.name)).toEqual([
        'Ada Lovelace',
    ]);

    const place = await pages.create({ kind: 'place', name: 'Uppsala' });
    await expect(
        pages.merge({ keep: ada.id, merge: place.id }),
    ).rejects.toThrow(/same kind/);
});

it('offers its operations, and says which rewrite what is known', async () => {
    const { operations } = (await import('#extensions/wiki')).extension;
    const rewrites = Object.entries(operations).map(([name, own]) => [
        name,
        !!own.rewrites,
    ]);
    expect(Object.fromEntries(rewrites)).toEqual({
        find: false,
        get: false,
        citing: false,
        create: false,
        addFact: false,
        update: false,
        merge: true,
        retractFact: true,
    });
});

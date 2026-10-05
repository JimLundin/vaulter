import { expect, it, vi } from 'vitest';
import type { Model } from '#extensions/openai';
import { startApp } from '../../app.ts';

// A model that files notes the way the instructions ask, by looking at the note
// and the pages sent; with `offline`, every request fails, as with no key yet.
let offline = false;
const none = { create: [], add: [], summaries: [] };
const fake: Pick<Model, 'json'> = {
    json<T>(req: { input: unknown; schema: { parse: (v: unknown) => T } }) {
        if (offline) {
            return Promise.reject(new Error('OpenAI 401: no key'));
        }
        const { note, pages } = req.input as {
            note: { text: string };
            pages: { id: string; name: string }[];
        };
        const id = (name: string) =>
            pages.find((place) => place.name === name)?.id;
        let plan: Record<string, unknown> = { ...none, ask: [] };
        if (note.text.startsWith('Lunch')) {
            plan = {
                ...plan,
                create: [
                    {
                        ref: 'n1',
                        kind: 'person',
                        name: 'Ada',
                        aliases: [],
                        facts: [
                            { text: 'Had lunch at Café Lumière', at: null },
                        ],
                    },
                    {
                        ref: 'n2',
                        kind: 'place',
                        name: 'Café Lumière',
                        aliases: ['Lumière'],
                        facts: [],
                    },
                ],
                summaries: [{ id: 'n1', summary: 'A friend.' }],
            };
        }
        if (note.text.startsWith('Ada')) {
            plan = {
                ...plan,
                add: [
                    {
                        id: id('Ada'),
                        facts: [{ text: 'Birthday in December', at: null }],
                    },
                ],
                ask: [
                    {
                        title: 'Is "the café" Café Lumière?',
                        body: null,
                        yes: {
                            ...none,
                            add: [
                                {
                                    id: id('Café Lumière'),
                                    facts: [{ text: 'Ada likes it', at: null }],
                                },
                            ],
                        },
                        no: {
                            ...none,
                            create: [
                                {
                                    ref: 'n3',
                                    kind: 'place',
                                    name: 'The café',
                                    aliases: [],
                                    facts: [],
                                },
                            ],
                        },
                    },
                ],
            };
        }
        return Promise.resolve(req.schema.parse(plan));
    },
};
vi.doMock('#extensions/openai', () => ({ model: fake }));

/** The wiki started, with what it uses. */
async function start() {
    await startApp(['wiki']);
    return {
        log: (await import('#extensions/notes')).notes,
        pages: (await import('#extensions/wiki')).wiki,
        asked: (await import('#extensions/questions')).questionsFor('screen'),
    };
}

function settle() {
    return new Promise((resolve) => setTimeout(resolve, 50));
}

it('revises pages from notes, and asks when unsure', async () => {
    offline = false;
    const { log, pages, asked } = await start();

    const n1 = await log.append({ text: 'Lunch with Ada at Café Lumière' });
    // The revision runs on its own once the note is appended: wait for it to
    // have written the page.
    await vi.waitFor(
        async () =>
            expect(await pages.find('Ada', ['person'])).toMatchObject([
                { kind: 'person', name: 'Ada', summary: 'A friend.' },
            ]),
        { timeout: 2000 },
    );
    const [ada] = await pages.find('Ada', ['person']);
    expect(ada.facts.map((f) => [f.text, f.sources])).toEqual([
        ['Had lunch at Café Lumière', [n1.id]],
    ]);
    // Found by an alias too.
    expect((await pages.find('lumière')).map((e) => e.name)).toEqual([
        'Café Lumière',
    ]);

    const n2 = await log.append({
        text: 'Ada said her birthday is in December; we met at the café',
    });
    await vi.waitFor(async () => expect(await asked.open()).toHaveLength(1), {
        timeout: 2000,
    });
    expect(
        (await pages.get({ type: ada.type, id: ada.id }))?.facts.map(
            (f) => f.text,
        ),
    ).toEqual(['Had lunch at Café Lumière', 'Birthday in December']);
    const [q] = await asked.open();
    expect(q).toMatchObject({
        from: 'wiki',
        topic: 'revise',
        title: 'Is "the café" Café Lumière?',
        notes: [n2.id],
    });
    await asked.answer(q.id, { choice: 'yes' });
    const [cafe] = await pages.find('Café Lumière', ['place']);
    expect(cafe.facts.map((f) => [f.text, f.sources])).toEqual([
        ['Ada likes it', [n2.id]],
    ]);
    expect((await pages.citing(n2.id)).map((e) => e.name).sort()).toEqual([
        'Ada',
        'Café Lumière',
    ]);

    // Merging folds the facts and aliases together, and what pointed at the
    // merged page follows.
    const dup = await pages.create('person', { name: 'Ada L.' });
    await pages.addFact(
        { type: dup.type, id: dup.id },
        { text: 'Works in Uppsala', sources: [n1.id] },
    );
    const trip = await pages.create('event', {
        name: 'Trip',
        people: [{ type: dup.type, id: dup.id }],
    });
    const merged = await pages.merge(
        { type: ada.type, id: ada.id },
        { type: dup.type, id: dup.id },
    );
    expect(merged.aliases).toEqual(['Ada L.']);
    expect(merged.facts.map((f) => f.text)).toEqual([
        'Had lunch at Café Lumière',
        'Birthday in December',
        'Works in Uppsala',
    ]);
    expect((await pages.get({ type: trip.type, id: trip.id }))?.people).toEqual(
        [{ type: ada.type, id: ada.id }],
    );
    expect(await pages.get({ type: dup.type, id: dup.id })).toBeUndefined();

    const { tools } = await import('#extensions/wiki');
    expect(Object.fromEntries(tools.map((t) => [t.name, t.access]))).toEqual({
        findPages: 'read',
        getPage: 'read',
        pagesCiting: 'read',
        createPage: 'write',
        addFact: 'write',
        updatePage: 'write',
        mergePages: 'ask',
        retractFact: 'ask',
    });
    expect(tools.every((t) => typeof t.input.parse === 'function')).toBe(true);
});

it('works by hand when the model cannot be reached', async () => {
    offline = true;
    const { log, pages } = await start();
    const note = await log.append({ text: 'Swim at Eriksdal' });
    await expect(pages.revise(note.id)).rejects.toThrow(/no key/);
    const place = await pages.create('place', {
        name: 'Eriksdalsbadet',
        area: 'Södermalm',
    });
    expect(place).toMatchObject({
        kind: 'place',
        area: 'Södermalm',
        facts: [],
    });
});

it('keeps two facts added at once, and merges pages', async () => {
    offline = true;
    const { log, pages } = await start();
    const note = await log.append({ text: 'Ada swims on Sundays' });
    const ada = await pages.create('person', { name: 'Ada' });
    const ref = { type: ada.type, id: ada.id };
    await Promise.all([
        pages.addFact(ref, { text: 'Swims', sources: [note.id] }),
        pages.addFact(ref, { text: 'On Sundays', sources: [note.id] }),
    ]);
    expect((await pages.get(ref))?.facts.map((f) => f.text).sort()).toEqual([
        'On Sundays',
        'Swims',
    ]);

    const lovelace = await pages.create('person', { name: 'Ada Lovelace' });
    await pages.merge({ type: lovelace.type, id: lovelace.id }, ref);
    expect(await pages.get(ref)).toBeUndefined();
    const kept = await pages.get({ type: lovelace.type, id: lovelace.id });
    expect([kept?.aliases, kept?.facts.length]).toEqual([['Ada'], 2]);
    expect((await pages.find('ada')).map((e) => e.name)).toEqual([
        'Ada Lovelace',
    ]);
});

it('revises a failed note again on the next start', async () => {
    offline = true;
    const before = await start();
    await before.log.append({ text: 'Lunch with Ada at Café Lumière' });
    await settle();
    expect(await before.pages.find('Ada')).toEqual([]);

    // The key is set, and the app starts again (storage's database is still
    // this device's).
    offline = false;
    const after = await start();
    await vi.waitFor(
        async () =>
            expect(await after.pages.find('Ada', ['person'])).toHaveLength(1),
        {
            timeout: 2000,
        },
    );
});

import { expect, it, vi } from 'vitest';
import type { Operation } from '#core';
import type { ModelCall } from '#extensions/openai';
import { restart } from '../../app.ts';

// A model that follows a script: call one operation, then answer from what
// came back. It keeps the names of the operations it was offered each time.
const offered: string[][] = [];
const scripted = {
    async answer({
        prompt,
        fns,
    }: {
        prompt: string;
        fns: Record<string, Operation>;
    }) {
        offered.push(Object.keys(fns));
        const calls: ModelCall[] = [];
        const call = async (name: string, input: unknown) => {
            const own = Object.entries(fns).find(([n]) => n === name)?.[1];
            if (!own) {
                throw new Error(`no operation ${name}`);
            }
            const output = await own(input);
            calls.push({ name, input, output });
            return output;
        };
        if (prompt.startsWith('Who')) {
            const found = (await call('wiki__find', { query: 'Ada' })) as {
                name: string;
                summary: string;
            }[];
            const text = found
                .map((p) => `${p.name}: ${p.summary}`)
                .sort((a, b) => a.localeCompare(b));
            return { text: text.join('; '), calls };
        }
        const { keep, merge } = JSON.parse(prompt.slice(prompt.indexOf('{')));
        const out = (await call('wiki__merge', { keep, merge })) as {
            asked?: string;
        };
        return { text: out.asked ? 'Asked you first' : 'Merged', calls };
    },
};
// The model, as the core loads it too: an extension that offers nothing.
vi.doMock('#extensions/openai', () => ({ model: scripted, extension: {} }));

async function start() {
    restart();
    return {
        pages: (await import('#extensions/wiki')).wiki,
        vaulter: (await import('#extensions/agent')).agent,
        asked: (await import('#extensions/questions')).questions,
    };
}

it('asks the person before an operation that rewrites what is known', async () => {
    const { pages, vaulter, asked } = await start();
    const ada = await pages.create({
        kind: 'person',
        name: 'Ada',
        summary: 'A friend from Uppsala.',
    });
    const dup = await pages.create({ kind: 'person', name: 'Ada L.' });

    const answer = await vaulter.ask({ prompt: 'Who is Ada?' });
    expect(answer.text).toBe('Ada L.: ; Ada: A friend from Uppsala.');
    expect(answer.calls.map((call) => call.name)).toEqual(['wiki__find']);
    expect(offered[0]).toContain('wiki__merge');

    const refs = {
        keep: ada.id,
        merge: dup.id,
    };
    const merge = () =>
        vaulter.ask({ prompt: `Merge these: ${JSON.stringify(refs)}` });
    expect((await merge()).text).toBe('Asked you first');
    // Nothing changes until the person says yes: then the call is made.
    expect((await pages.get({ id: refs.merge }))?.id).toBe(dup.id);
    const [q] = await asked.open({});
    expect(q).toMatchObject({
        from: 'agent',
        title: "May Vaulter use wiki's merge?",
    });
    await asked.answer({ id: q.id, choice: 'yes' });
    expect((await pages.get({ id: refs.keep }))?.aliases).toEqual(['Ada L.']);
    expect(await pages.get({ id: refs.merge })).toBeUndefined();

    // Asked again, and the person says no: nothing is made.
    const other = await pages.create({ kind: 'person', name: 'Grace' });
    refs.merge = other.id;
    await merge();
    const [again] = await asked.open({});
    await asked.answer({ id: again.id, choice: 'no' });
    expect((await pages.get({ id: refs.merge }))?.id).toBe(other.id);
});

it('makes an approved call after a restart', async () => {
    const before = await start();
    const ada = await before.pages.create({ kind: 'person', name: 'Ada' });
    const dup = await before.pages.create({ kind: 'person', name: 'Ada L.' });
    const refs = {
        keep: ada.id,
        merge: dup.id,
    };
    await before.vaulter.ask({
        prompt: `Merge these: ${JSON.stringify(refs)}`,
    });

    // The app starts again (storage's database is still this device's), and the
    // person says yes.
    const after = await start();
    const [q] = await after.asked.open({});
    await after.asked.answer({ id: q.id, choice: 'yes' });
    expect(await after.pages.get({ id: refs.merge })).toBeUndefined();
});

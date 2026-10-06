import { expect, it } from 'vitest';
import { restart } from '../../app.ts';

/** A choice's call: keeping a note, which a test can look for. */
function noting(text: string) {
    return { extension: 'notes', operation: 'append', input: { text } };
}

async function start() {
    restart();
    return {
        asked: (await import('#extensions/questions')).questions,
        log: (await import('#extensions/notes')).notes,
        yesNo: (await import('#extensions/questions')).yesNo,
    };
}

async function texts(log: Awaited<ReturnType<typeof start>>['log']) {
    return (await log.list({})).map((note) => note.text);
}

it('keeps a question open until it is answered, then makes the chosen call', async () => {
    const { asked, log, yesNo } = await start();
    const id = await asked.ask({
        from: 'test',
        title: 'Is Ada the same as Ada L.?',
        choices: yesNo(noting('the same'), noting('not the same')),
    });
    expect(await asked.get({ id })).toMatchObject({
        from: 'test',
        title: 'Is Ada the same as Ada L.?',
        status: 'open',
    });
    expect((await asked.open({})).map((q) => q.id)).toEqual([id]);

    // The screen answers, as the person.
    await asked.answer({ id, choice: 'yes' });
    expect(await asked.get({ id })).toMatchObject({
        status: 'answered',
        choice: 'yes',
    });
    expect(await asked.open({})).toEqual([]);
    expect(await texts(log)).toEqual(['the same']);
});

it('makes the chosen call after a restart', async () => {
    const before = await start();
    const id = await before.asked.ask({
        from: 'test',
        title: 'Same Ada?',
        choices: before.yesNo(noting('the same')),
    });

    // The app starts again (storage's database is still this device's), and
    // the person says yes.
    const after = await start();
    await after.asked.answer({ id, choice: 'yes' });
    expect(await texts(after.log)).toEqual(['the same']);
});

it('makes a choice without a call too', async () => {
    const { asked, log, yesNo } = await start();
    const id = await asked.ask({
        from: 'test',
        title: 'Same Ada?',
        choices: yesNo(noting('the same')),
    });
    await asked.answer({ id, choice: 'no' });
    expect((await asked.get({ id }))?.choice).toBe('no');
    expect(await texts(log)).toEqual([]);
});

it('asks once per key while the question is open', async () => {
    const { asked } = await start();
    const question = {
        from: 'test',
        title: 'When was the trip?',
        key: 'trip-date',
        choices: [{ id: 'ok', label: 'OK' }],
    };
    const first = await asked.ask(question);
    expect(await asked.ask(question)).toEqual(first);
    await asked.answer({ id: first, choice: 'ok' });
    expect(await asked.ask(question)).not.toEqual(first);
});

it('makes the call once, and refuses a choice it does not have', async () => {
    const { asked, log, yesNo } = await start();
    const id = await asked.ask({
        from: 'test',
        title: 'Same Ada?',
        choices: yesNo(noting('the same')),
    });
    await expect(asked.answer({ id, choice: 'maybe' })).rejects.toThrow(
        /not one of its choices/,
    );
    await asked.answer({ id, choice: 'yes' });
    await expect(asked.answer({ id, choice: 'yes' })).rejects.toThrow(
        /not open/,
    );
    expect(await texts(log)).toEqual(['the same']);
});

it('leaves the question open when its call fails', async () => {
    const { asked, yesNo } = await start();
    const id = await asked.ask({
        from: 'test',
        title: 'Keep an empty note?',
        // notes.append refuses an empty note.
        choices: yesNo(noting('   ')),
    });
    await expect(asked.answer({ id, choice: 'yes' })).rejects.toThrow();
    expect(await asked.get({ id })).toMatchObject({ status: 'open' });
    expect((await asked.get({ id }))?.choice).toBeUndefined();
});

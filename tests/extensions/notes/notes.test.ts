// Notes: each kept as it was said, listed in order, and told to whoever
// listens.
import { expect, it } from 'vitest';
import { restart } from '../../app.ts';

/** Time for listeners, which hear of a change after it is kept. */
function settle() {
    return new Promise((resolve) => setTimeout(resolve, 20));
}

async function use() {
    restart();
    return (await import('#extensions/notes')).notes;
}

it('keeps a note as it was, with when it was said', async () => {
    const log = await use();
    const note = await log.append({
        text: 'Coffee with Ada',
        source: 'voice',
        context: { place: 'café' },
    });
    expect([note.text, note.source, note.context]).toEqual([
        'Coffee with Ada',
        'voice',
        { place: 'café' },
    ]);
    expect(
        !Number.isNaN(Date.parse(note.at)),
        'at is a date-time',
    ).toBeTruthy();
    expect(await log.get({ id: note.id })).toEqual(note);
    expect(await log.get({ id: 'nope' })).toEqual(undefined);
});
it('refuses an empty note', async () => {
    const log = await use();
    await expect(log.append({ text: '   ' })).rejects.toThrow();
});
it('lists by when they were said, newest first, within a range', async () => {
    const log = await use();
    // One log for everyone: other checks' notes may be there too, so look at a
    // range of its own.
    const range = {
        since: '2001-01-01T00:00:00.000Z',
        until: '2001-01-04T00:00:00.000Z',
    };
    await log.append({
        text: 'b',
        at: '2001-01-02T10:00:00.000Z',
        source: 'import',
    });
    await log.append({
        text: 'a',
        at: '2001-01-01T10:00:00.000Z',
        source: 'import',
    });
    await log.append({
        text: 'c',
        at: '2001-01-03T10:00:00.000Z',
        source: 'import',
    });
    expect((await log.list(range)).map((x) => x.text)).toEqual(['c', 'b', 'a']);
    expect(
        (await log.list({ ...range, order: 'oldest', limit: 2 })).map(
            (x) => x.text,
        ),
    ).toEqual(['a', 'b']);
    expect(
        (
            await log.list({
                since: '2001-01-02T00:00:00.000Z',
                until: '2001-01-03T00:00:00.000Z',
            })
        ).map((x) => x.text),
    ).toEqual(['b']);
});
it('tells a subscriber about each note appended', async () => {
    const log = await use();
    const seen: string[] = [];
    const stop = await log.onAppended({
        listener: (x) => {
            seen.push(x.text);
        },
    });
    await log.append({ text: 'one' });
    await settle();
    stop();
    await log.append({ text: 'two' });
    await settle();
    expect(seen).toEqual(['one']);
});

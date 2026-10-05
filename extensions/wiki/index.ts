// The wiki: pages about people, places, events and topics, every fact citing
// its notes. Each note appended is revised into the pages it touches, and it
// gives Vaulter its tools.

import { notes } from '#extensions/notes';
import { questionsFor } from '#extensions/questions';
import { collection } from '#extensions/storage';
import type { Wiki } from './api.ts';
import { pages } from './pages.ts';
import { answered, revise } from './revise.ts';
import { toolsOf } from './tools.ts';

export * from './api.ts';

/** Notes whose revision failed (no key yet, offline, a bad answer), to be
 * revised again on the next start. */
const unrevised = collection<{ error: string }>('wiki/unrevised');
let queue: Promise<unknown> = Promise.resolve();

/** Revises a note after the one before, in the order the notes came. */
function reviseInTurn(noteId: string) {
    const next = queue.then(async () => {
        const note = await notes.get(noteId);
        if (!note) {
            throw new Error(`no note ${noteId}`);
        }
        return revise(note);
    });
    queue = next.catch(() => undefined);
    return next;
}

async function attempt(noteId: string) {
    try {
        await reviseInTurn(noteId);
        await unrevised.delete(noteId);
    } catch (error) {
        const reason = (error as Error).message;
        if (await unrevised.get(noteId)) {
            await unrevised.update(noteId, () => ({ error: reason }));
        } else {
            await unrevised.create({ id: noteId, error: reason });
        }
    }
}

notes.onAppended((note) => void attempt(note.id));
await questionsFor('wiki').handle('revise', (answer, question) =>
    answered(answer.choice, question.data),
);
for (const left of await unrevised.query({ order: 'asc' })) {
    void attempt(left.id);
}

export const wiki: Wiki = { ...pages, revise: reviseInTurn };
export const tools = toolsOf(wiki);

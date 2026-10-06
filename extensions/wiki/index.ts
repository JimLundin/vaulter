// The wiki: pages about people, places, events and topics, every fact citing
// its notes. Each note appended is revised into the pages it touches, and it
// gives Vaulter its tools.

import { notes } from '#extensions/notes';
import { questionsFor } from '#extensions/questions';
import { collection } from '#extensions/storage';
import { queue } from '#kernel';
import {
    addFact,
    citing,
    create,
    find,
    get,
    merge,
    retractFact,
    update,
} from './pages.ts';
import { answered, revise } from './revise.ts';

export * from './api.ts';
export { tools } from './tools.ts';

/** The notes revised into the wiki, by note id. A note whose revision
 * failed (no key yet, offline, a bad answer) isn't here, and is revised
 * again on the next start. */
const revised = collection<{ at: string }>('wiki/revised');
const inOrder = queue();

/** Revises a note after the one before, in the order the notes came. */
function reviseInTurn(noteId: string) {
    return inOrder(async () => {
        const note = await notes.get(noteId);
        if (!note) {
            throw new Error(`no note ${noteId}`);
        }
        const result = await revise(note);
        if (!(await revised.get(noteId))) {
            await revised.create({ id: noteId, at: new Date().toISOString() });
        }
        return result;
    });
}

notes.onAppended((note) => void reviseInTurn(note.id));
await questionsFor('wiki').handle('revise', (answer, question) =>
    answered(answer.choice, question.data),
);
const done = new Set((await revised.query()).map((note) => note.id));
for (const note of await notes.list({ order: 'oldest' })) {
    if (!done.has(note.id)) {
        void reviseInTurn(note.id);
    }
}

export const wiki = {
    find,
    get,
    create,
    update,
    addFact,
    retractFact,
    merge,
    citing,
    /** Revises the pages a note touches, as happens on its own when a note
     * is appended. */
    revise: reviseInTurn,
};

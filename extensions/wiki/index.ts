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

/** Notes waiting to be revised, by note id. A note is put here when it is
 * appended and taken off once its revision succeeds, so one whose revision
 * failed (no key yet, offline, a bad answer) is tried again on the next
 * start. */
const unrevised = collection<{ at?: string }>('wiki/unrevised');
const inOrder = queue();

/** Revises a note after the one before, in the order the notes came. */
function reviseInTurn(noteId: string) {
    return inOrder(async () => {
        const note = await notes.get(noteId);
        if (!note) {
            throw new Error(`no note ${noteId}`);
        }
        const result = await revise(note);
        await unrevised.delete(noteId);
        return result;
    });
}

notes.onAppended((note) => {
    void unrevised.create({ id: note.id, at: note.at });
    void reviseInTurn(note.id);
});
await questionsFor('wiki').handle('revise', (answer, question) =>
    answered(answer.choice, question.data),
);
for (const left of await unrevised.query({ order: 'asc' })) {
    void reviseInTurn(left.id);
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

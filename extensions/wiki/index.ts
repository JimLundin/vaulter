// The wiki: pages about people, places, events and topics, every fact citing its notes. Each note
// appended is revised by the model (#chat) into the pages it touches, and what the model isn't sure of
// is asked (#questions) rather than guessed. It gives Vaulter its tools (`tools`).

import { z } from 'zod';
import { chat } from '#chat';
import type { WikiV1 } from '#contracts/wiki';
import { notes } from '#notes';
import { questionsFor } from '#questions';
import { recordsFor } from '#records';
import { pages, registerTypes } from './pages.ts';
import { reviser } from './revise.ts';
import { toolsOf } from './tools.ts';

const records = recordsFor('wiki');
const questions = questionsFor('wiki');
const { api, all } = pages(records, await registerTypes(records));
const r = reviser({ wiki: api, all, chat, questions });

// One revision at a time, in the order the notes came.
let queue: Promise<unknown> = Promise.resolve();
const revise = (noteId: string) => {
  const next = queue.then(async () => {
    const note = await notes.get(noteId);
    if (!note) throw new Error(`no note ${noteId}`);
    return r.revise(note);
  });
  queue = next.catch(() => undefined);
  return next;
};

// A note whose revision failed (no key yet, offline, a bad answer from the model) is kept, and revised
// again on the next start; one that succeeds is put away.
const unrevised = await records.registerType('unrevised', { error: z.string() });
const attempt = (noteId: string) =>
  revise(noteId).then(
    () => records.delete(unrevised, noteId),
    async (e: Error) => {
      const left = await records.get(unrevised, noteId);
      if (left) await records.update(unrevised, noteId, () => ({ error: e.message }));
      else await records.create(unrevised, { id: noteId, error: e.message });
    },
  );
await notes.onAppended((n) => void attempt(n.id));
await questions.handle('revise', (answer, q) => r.answered(answer.choice, q.data));
for (const left of await records.query(unrevised, { order: 'asc' })) void attempt(left.id);

export const wiki: WikiV1 = { ...api, revise };
export const tools = toolsOf(wiki);

// The wiki: pages about people, places, events and topics, every fact citing its notes. Each note
// appended is revised by the model (openai) into the pages it touches, and what the model isn't sure of
// is asked (questions) rather than guessed. It gives Vaulter its tools (`tools`).

import { notes } from '#extensions/notes';
import { chat } from '#extensions/openai';
import { questionsFor } from '#extensions/questions';
import { collection } from '#extensions/storage';
import type { Wiki } from './api.ts';
import { pages } from './pages.ts';
import { reviser } from './revise.ts';
import { toolsOf } from './tools.ts';

export * from './api.ts';

const questions = questionsFor('wiki');
const { api, all } = pages();
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
const unrevised = collection<{ error: string }>('wiki/unrevised');
const attempt = (noteId: string) =>
  revise(noteId).then(
    () => unrevised.delete(noteId),
    async (e: Error) => {
      if (await unrevised.get(noteId)) await unrevised.update(noteId, () => ({ error: e.message }));
      else await unrevised.create({ id: noteId, error: e.message });
    },
  );
notes.onAppended((n) => void attempt(n.id));
await questions.handle('revise', (answer, q) => r.answered(answer.choice, q.data));
for (const left of await unrevised.query({ order: 'asc' })) void attempt(left.id);

export const wiki: Wiki = { ...api, revise };
export const tools = toolsOf(wiki);

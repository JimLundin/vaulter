// The wiki (wiki@1): pages about people, places, events and topics, every fact citing its notes. With a
// model (ai.chat), each note appended is revised into the pages it touches; with questions, what the
// model isn't sure of is asked rather than guessed; with an agent, Vaulter gets the wiki's tools. Without
// any of them, the wiki still works by hand.
import { defineExtension } from '#kernel';
import { z } from 'zod';
import { agentTools } from '#contracts/agent.tools';
import { chat } from '#contracts/ai.chat';
import { notes } from '#contracts/notes';
import { questions } from '#contracts/questions';
import { records } from '#contracts/records';
import { type WikiV1, wiki } from '#contracts/wiki';
import { pages, registerTypes } from './pages.ts';
import { reviser } from './revise.ts';
import { addTools } from './tools.ts';

export default defineExtension({
  id: 'wiki',
  version: '1.0.0',
  provides: { wiki },
  requires: { records, notes },
  optional: { chat, questions, agentTools },
  agentGuide:
    'The source of truth for people, places, events and topics the person knows. Look things up here first; cite a note for every fact.',
  async setup({ records, notes, chat, questions, agentTools }) {
    const types = await registerTypes(records);
    const { api, all } = pages(records, types);
    const r = chat ? reviser({ wiki: api, all, chat, questions }) : undefined;

    // One revision at a time, in the order the notes came.
    let queue: Promise<unknown> = Promise.resolve();
    const revise = (noteId: string) => {
      const next = queue.then(async () => {
        if (!r) throw new Error('revising needs a language model (ai.chat)');
        const note = await notes.get(noteId);
        if (!note) throw new Error(`no note ${noteId}`);
        return r.revise(note);
      });
      queue = next.catch(() => undefined);
      return next;
    };
    if (r) {
      // A note whose revision failed (no key yet, offline, a bad answer from the model) is kept, and
      // revised again on the next start; one that succeeds is put away.
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
      await questions?.handle('revise', (answer, q) => r.answered(answer.choice, q.data));
      for (const left of await records.query(unrevised, { order: 'asc' })) void attempt(left.id);
    }

    const full: WikiV1 = { ...api, revise };
    if (agentTools) await addTools(agentTools, full);
    return { wiki: full };
  },
});

// The wiki (wiki@1): pages about people, places, events and topics, every fact citing its notes. With a
// model (ai.chat), each note appended is revised into the pages it touches; with questions, what the
// model isn't sure of is asked rather than guessed; with an agent, Pip gets the wiki's tools. Without
// any of them, the wiki still works by hand.
import { defineExtension } from '@pip/kernel';
import { agentTools } from '@contracts/agent.tools';
import { chat } from '@contracts/ai.chat';
import { notes } from '@contracts/notes';
import { questions } from '@contracts/questions';
import { records } from '@contracts/records';
import { type WikiV1, wiki } from '@contracts/wiki';
import { KINDS, pages, registerTypes } from './pages.ts';
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
    const types = registerTypes(records);
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
      await notes.onAppended((n) => void revise(n.id).catch(() => undefined));
      await questions?.handle('revise', (answer, q) => r.answered(answer.choice, q.data));
    }

    const full: WikiV1 = {
      ...api,
      revise,
      async onChanged(handler) {
        const stops = await Promise.all(
          KINDS.map((k) => records.onChanged(types[k], (c) => handler({ type: c.type, id: c.id }))),
        );
        return () => {
          for (const s of stops) s();
        };
      },
    };
    if (agentTools) await addTools(agentTools, full);
    return { wiki: full };
  },
});

// Questions (questions@1): what Pip and other extensions ask the person, kept as records so they survive
// a restart. An asker handles answers under its own topics; an answer that arrives while the asker isn't
// running waits until it registers its handler again. Answering is personal (the kernel lets only a
// person do it), so no extension can answer its own question.
import { defineExtension, perCaller } from '@pip/kernel';
import {
  Answer,
  NewQuestion,
  type Question,
  type QuestionsV1,
  questions,
} from '@contracts/questions';
import { records } from '@contracts/records';
import { z } from 'zod';

type Handler = (answer: Answer, question: Question) => void;

export default defineExtension({
  id: 'questions',
  version: '1.0.0',
  provides: { questions },
  requires: { records },
  agentGuide:
    'Ask the person when something is unclear or you are unsure of a change; never guess.',
  setup({ records }) {
    const question = records.registerType('question', {
      ...NewQuestion.shape,
      from: z.string(),
      at: z.iso.datetime(),
      status: z.enum(['open', 'answered', 'dismissed', 'withdrawn']),
      answer: z.object({ choice: z.string().optional(), text: z.string().optional() }).optional(),
      /** Whether the asker's handler has had the answer. */
      delivered: z.boolean(),
    });
    type Stored = Question & { delivered: boolean };

    const handlers = new Map<string, Handler>();
    const watchers = new Set<(open: Question[]) => void>();
    const strip = (stored: Stored): Question => {
      const {
        delivered: _,
        type: _t,
        created: _c,
        updated: _u,
        v: _v,
        ...q
      } = stored as Stored & Record<string, unknown>;
      return q as unknown as Question;
    };
    const all = async () =>
      (await records.query(question, { order: 'oldest' })) as unknown as Stored[];
    const openOnes = async () => (await all()).filter((q) => q.status === 'open').map(strip);
    const changed = async () => {
      const list = await openOnes();
      for (const w of watchers) void Promise.resolve(w(list)).catch(() => undefined);
    };
    const save = (q: Stored) => records.put(question, q as never) as unknown as Promise<Stored>;

    const deliver = async (q: Stored) => {
      const h = handlers.get(`${q.from}/${q.topic}`);
      if (!(h && q.status === 'answered' && q.answer && !q.delivered)) return;
      await h(q.answer, strip(q));
      await save({ ...q, delivered: true });
    };

    const make = (from: string): QuestionsV1 => ({
      async ask(input) {
        const q = NewQuestion.parse(input);
        if (q.key) {
          const same = (await all()).find(
            (x) => x.from === from && x.key === q.key && x.status === 'open',
          );
          if (same) return same.id;
        }
        const saved = await save({
          ...q,
          from,
          at: new Date().toISOString(),
          status: 'open',
          delivered: false,
        } as Stored);
        await changed();
        return saved.id;
      },
      async handle(topic, handler) {
        const k = `${from}/${topic}`;
        handlers.set(k, handler);
        for (const q of await all()) if (q.from === from && q.topic === topic) await deliver(q);
        return () => {
          if (handlers.get(k) === handler) handlers.delete(k);
        };
      },
      async withdraw(id) {
        const q = (await records.get(question, id)) as unknown as Stored | undefined;
        if (!q || q.from !== from) throw new Error('only the asker can withdraw a question');
        if (q.status === 'open') await save({ ...q, status: 'withdrawn' });
        await changed();
      },
      open: openOnes,
      async get(id) {
        const q = (await records.get(question, id)) as unknown as Stored | undefined;
        return q && strip(q);
      },
      onChanged(handler) {
        watchers.add(handler);
        return Promise.resolve(() => {
          watchers.delete(handler);
        });
      },
      async answer(id, input) {
        const answer = Answer.parse(input);
        const q = (await records.get(question, id)) as unknown as Stored | undefined;
        if (q?.status !== 'open') throw new Error('that question is not open');
        if (answer.choice !== undefined && !q.choices?.some((c) => c.id === answer.choice))
          throw new Error(`"${answer.choice}" is not one of its choices`);
        if (answer.text !== undefined && q.choices?.length && !q.allowText)
          throw new Error('this question takes a choice, not text');
        const saved = await save({ ...q, status: 'answered', answer });
        await changed();
        await deliver(saved);
      },
      async dismiss(id) {
        const q = (await records.get(question, id)) as unknown as Stored | undefined;
        if (q?.status !== 'open') throw new Error('that question is not open');
        await save({ ...q, status: 'dismissed' });
        await changed();
      },
    });

    return { questions: perCaller(make) };
  },
});

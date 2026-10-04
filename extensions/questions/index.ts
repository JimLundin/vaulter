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
import { type Query, type Rec, records } from '@contracts/records';
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
    const fields = {
      ...NewQuestion.shape,
      from: z.string(),
      at: z.iso.datetime(),
      status: z.enum(['open', 'answered', 'dismissed', 'withdrawn']),
      answer: z.object({ choice: z.string().optional(), text: z.string().optional() }).optional(),
      /** Whether the asker's handler has had the answer. */
      delivered: z.boolean(),
    };
    const question = records.registerType('question', fields);
    type Stored = Rec<typeof fields>;

    const handlers = new Map<string, Handler>();
    const watchers = new Set<(open: Question[]) => void>();
    const strip = ({ delivered: _, meta: _m, ...q }: Stored): Question => q;
    const find = (where: Query['where']) =>
      records.query(question, { where, orderBy: 'at', order: 'asc' });
    const openOnes = async () => (await find({ status: 'open' })).map(strip);
    const changed = async () => {
      const list = await openOnes();
      for (const w of watchers) void Promise.resolve(w(list)).catch(() => undefined);
    };
    /** The question as it is now, changed by `change` if it may be. */
    const update = (id: string, change: (q: Stored) => Partial<Stored>) =>
      records.update(question, id, (q) => ({ ...q, ...change(q) }));

    const deliver = async (q: Stored) => {
      const h = handlers.get(`${q.from}/${q.topic}`);
      if (!(h && q.status === 'answered' && q.answer && !q.delivered)) return;
      await h(q.answer, strip(q));
      await update(q.id, () => ({ delivered: true }));
    };

    const make = (from: string): QuestionsV1 => ({
      async ask(input) {
        const q = NewQuestion.parse(input);
        if (q.key) {
          const [same] = await find({ from, key: q.key, status: 'open' });
          if (same) return same.id;
        }
        const saved = await records.create(question, {
          ...q,
          from,
          at: new Date().toISOString(),
          status: 'open',
          delivered: false,
        });
        await changed();
        return saved.id;
      },
      async handle(topic, handler) {
        const k = `${from}/${topic}`;
        handlers.set(k, handler);
        for (const q of await find({ from, topic })) await deliver(q);
        return () => {
          if (handlers.get(k) === handler) handlers.delete(k);
        };
      },
      async withdraw(id) {
        await update(id, (q) => {
          if (q.from !== from) throw new Error('only the asker can withdraw a question');
          return q.status === 'open' ? { status: 'withdrawn' } : {};
        });
        await changed();
      },
      open: openOnes,
      async get(id) {
        const q = await records.get(question, id);
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
        if (!(await records.get(question, id))) throw new Error('that question is not open');
        const saved = await update(id, (q) => {
          if (q.status !== 'open') throw new Error('that question is not open');
          if (answer.choice !== undefined && !q.choices?.some((c) => c.id === answer.choice))
            throw new Error(`"${answer.choice}" is not one of its choices`);
          if (answer.text !== undefined && q.choices?.length && !q.allowText)
            throw new Error('this question takes a choice, not text');
          return { status: 'answered', answer };
        });
        await changed();
        await deliver(saved);
      },
      async dismiss(id) {
        if (!(await records.get(question, id))) throw new Error('that question is not open');
        await update(id, (q) => {
          if (q.status !== 'open') throw new Error('that question is not open');
          return { status: 'dismissed' };
        });
        await changed();
      },
    });

    return { questions: perCaller(make) };
  },
});

// Questions: what Vaulter and other extensions ask the person, kept as records so they survive a
// restart. An asker handles answers under its own topics; an answer that arrives while the asker isn't
// running waits until it registers its handler again.

import { z } from 'zod';
import type { Query, Rec } from '#extensions/store-local';
import { recordsFor } from '#extensions/store-local';
import { Answer, NewQuestion, type Question, type Questions, Status } from './api.ts';

export * from './api.ts';

type Handler = (answer: Answer, question: Question) => unknown;

const records = recordsFor('questions');
const fields = {
  ...NewQuestion.shape,
  from: z.string(),
  at: z.iso.datetime(),
  status: Status,
  answer: Answer.optional(),
  /** Whether the asker's handler has had the answer. */
  delivered: z.boolean(),
};
const question = await records.registerType('question', fields);
type Kept = Rec<typeof fields>;

const handlers = new Map<string, Handler>();
const watchers = new Set<(open: Question[]) => void>();
const strip = ({ delivered: _, meta: _m, ...q }: Kept): Question => q;
const find = (where: Query['where']) =>
  records.query(question, { where, orderBy: 'at', order: 'asc' });
const openOnes = async () => (await find({ status: 'open' })).map(strip);
const changed = async () => {
  if (!watchers.size) return;
  const list = await openOnes();
  for (const w of watchers) queueMicrotask(() => w(list));
};
/** The question as it is now, changed by `change` if it may be. */
const update = (id: string, change: (q: Kept) => Partial<Kept>) =>
  records.update(question, id, (q) => ({ ...q, ...change(q) }));

/** The answer to its asker's handler; one the handler fails on stays undelivered, to go to it
 * again when the asker next registers it. */
const deliver = async (q: Kept) => {
  const h = handlers.get(`${q.from}/${q.topic}`);
  if (!(h && q.status === 'answered' && q.answer && !q.delivered)) return;
  try {
    await h(q.answer, strip(q));
  } catch {
    return;
  }
  await update(q.id, () => ({ delivered: true }));
};

/** Questions as the asker `from` has them: it asks, and handles the answers, under its own topics. */
export const questionsFor = (from: string): Questions => ({
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
    for (const q of await find({ from, topic, status: 'answered', delivered: false }))
      await deliver(q);
    return () => {
      if (handlers.get(k) === handler) handlers.delete(k);
    };
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
    const saved = await update(id, (q) => {
      if (q.status !== 'open') throw new Error('that question is not open');
      if (answer.choice !== undefined && !q.choices?.some((c) => c.id === answer.choice))
        throw new Error(`"${answer.choice}" is not one of its choices`);
      if (answer.choice === undefined && q.choices?.length)
        throw new Error('this question takes one of its choices');
      return { status: 'answered', answer };
    });
    await changed();
    await deliver(saved);
  },
  async dismiss(id) {
    await update(id, (q) => {
      if (q.status !== 'open') throw new Error('that question is not open');
      return { status: 'dismissed' };
    });
    await changed();
  },
});

// A removed asker's questions go with it: nothing is left to hand their answers to.
export const forget = async (from: string) => {
  for (const q of await find({ from })) await records.delete(question, q.id);
};

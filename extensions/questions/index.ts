// Questions: what Vaulter and other extensions ask the person, kept so they
// survive a restart. An answer that arrives while its asker isn't handling
// its topic waits until the asker does.

import { collection, type Query, type Rec } from '#extensions/storage';
import { omit } from '#kernel';
import {
  Answer,
  type Handler,
  NewQuestion,
  type Question,
  type Questions,
} from './api.ts';

export * from './api.ts';

/** A question as kept, with whether the asker has had its answer. */
type Fields = Omit<Question, 'id'> & { delivered: boolean };
type Kept = Rec<Fields>;

const kept = collection<Fields>('questions/question');
const handlers = new Map<string, Handler>();

function questionOf(record: Kept): Question {
  return omit(record, 'delivered', 'meta');
}

function find(where: Query<Fields>['where']) {
  return kept.query({ where, orderBy: 'at', order: 'asc' });
}

/** Hands the answer to its asker's handler. If the handler fails, the
 * answer stays undelivered, and goes to it again when the asker next
 * handles its topic. */
async function deliver(question: Kept) {
  const handler = handlers.get(`${question.from}/${question.topic}`);
  if (!handler || !question.answer || question.delivered) {
    return;
  }
  try {
    await handler(question.answer, questionOf(question));
  } catch {
    return;
  }
  await kept.update(question.id, (now) => ({ ...now, delivered: true }));
}

/** The reason `answer` doesn't fit `question`, if it doesn't. */
function misfit(question: Kept, answer: Answer) {
  if (question.status !== 'open') {
    return 'that question is not open';
  }
  const picked = answer.choice;
  if (picked !== undefined && !question.choices?.some((c) => c.id === picked)) {
    return `"${picked}" is not one of its choices`;
  }
  if (picked === undefined && question.choices?.length) {
    return 'this question takes one of its choices';
  }
  return undefined;
}

/** Questions as the asker `from` has them: it asks, and handles the
 * answers, under its own topics. */
export function questionsFor(from: string): Questions {
  return {
    async ask(input) {
      const question = NewQuestion.parse(input);
      if (question.key) {
        const [same] = await find({ from, key: question.key, status: 'open' });
        if (same) {
          return same.id;
        }
      }
      const saved = await kept.create({
        ...question,
        from,
        at: new Date().toISOString(),
        status: 'open',
        delivered: false,
      });
      return saved.id;
    },

    async handle(topic, handler) {
      const key = `${from}/${topic}`;
      handlers.set(key, handler);
      const waiting = await find({
        from,
        topic,
        status: 'answered',
        delivered: false,
      });
      for (const question of waiting) {
        await deliver(question);
      }
      return () => {
        if (handlers.get(key) === handler) {
          handlers.delete(key);
        }
      };
    },

    async open() {
      const found = await find({ status: 'open' });
      return found.map(questionOf);
    },

    async get(id) {
      const record = await kept.get(id);
      return record && questionOf(record);
    },

    async answer(id, input) {
      const answer = Answer.parse(input);
      const saved = await kept.update(id, (question) => {
        const reason = misfit(question, answer);
        if (reason) {
          throw new Error(reason);
        }
        return { ...question, status: 'answered', answer };
      });
      await deliver(saved);
    },
  };
}

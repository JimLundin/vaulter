// Questions: what Vaulter and other extensions ask the person, kept so they
// survive a restart. An answer that arrives while its asker isn't handling
// its topic waits until the asker does.

import type { z } from 'zod';
import { collection, type Query } from '#extensions/storage';
import { Answer, type Handler, NewQuestion, type Question } from './api.ts';

export * from './api.ts';

type Fields = Omit<Question, 'id' | 'meta'>;

const kept = collection<Fields>('questions/question');
const handlers = new Map<string, Handler>();

function find(where: Query<Fields>['where']) {
    return kept.query({ where, orderBy: 'at', order: 'asc' });
}

/** Hands the answer to its asker's handler. If the handler fails, the
 * answer stays undelivered, and goes to it again when the asker next
 * handles its topic. */
async function deliver(question: Question) {
    const handler = handlers.get(`${question.from}/${question.topic}`);
    if (!handler || !question.answer || question.delivered) {
        return;
    }
    try {
        await handler(question.answer, question);
    } catch {
        return;
    }
    await kept.update(question.id, (now) => ({ ...now, delivered: true }));
}

/** The reason `answer` doesn't fit `question`, if it doesn't. */
function misfit(question: Question, answer: Answer) {
    if (question.status !== 'open') {
        return 'that question is not open';
    }
    const picked = answer.choice;
    if (
        picked !== undefined &&
        !question.choices?.some((c) => c.id === picked)
    ) {
        return `"${picked}" is not one of its choices`;
    }
    if (picked === undefined && question.choices?.length) {
        return 'this question takes one of its choices';
    }
    return undefined;
}

/** Questions as the asker `from` has them: it asks, and handles the
 * answers, under its own topics. */
export function questionsFor(from: string) {
    return {
        /** Asks, and returns the question's id. */
        async ask(input: z.input<typeof NewQuestion>) {
            const question = NewQuestion.parse(input);
            if (question.key) {
                const [same] = await find({
                    from,
                    key: question.key,
                    status: 'open',
                });
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

        /** Handles the answers to the asker's questions on `topic`. Answers
         * that came while nothing handled them are delivered now. */
        async handle(topic: string, handler: Handler) {
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

        open() {
            return find({ status: 'open' });
        },

        get(id: string) {
            return kept.get(id);
        },

        /** The person's answer, from a screen. */
        async answer(id: string, input: Answer) {
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

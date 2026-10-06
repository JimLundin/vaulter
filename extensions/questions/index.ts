// Questions: what Vaulter and other extensions ask the person, kept so they
// survive a restart. Answering one makes the call its choice holds, through
// the core, so the asker needn't be listening.

import { z } from 'zod';
import { call, type Extension, type Operation, operation } from '#core';
import { collection } from '#extensions/storage';
import { KeptQuestion, NewQuestion } from './api.ts';

export * from './api.ts';

const kept = collection('questions/question', KeptQuestion, ['at']);

/** The question `id`, marked answered with `choice`, if it is still open. */
function close(id: string, choice: string) {
    return kept.update({
        id,
        change: (question) => {
            if (question.status !== 'open') {
                throw new Error('that question is not open');
            }
            return { ...question, status: 'answered', choice };
        },
    });
}

function reopen(id: string) {
    return kept.update({
        id,
        change: (question) => ({
            ...question,
            status: 'open',
            choice: undefined,
        }),
    });
}

export const questions = {
    ask: operation({
        description:
            'Ask the person something, with the choices they can make and ' +
            "the call each makes. Returns the question's id.",
        input: NewQuestion,
        run: async (question) => {
            if (question.key) {
                const [same] = await kept.query({
                    where: {
                        from: question.from,
                        key: question.key,
                        status: 'open',
                    },
                });
                if (same) {
                    return same.id;
                }
            }
            const saved = await kept.create({
                ...question,
                at: new Date().toISOString(),
                status: 'open',
            });
            return saved.id;
        },
    }),
    open: operation({
        description: "The questions waiting for the person's answer.",
        input: z.object({}),
        run: () =>
            kept.query({
                where: { status: 'open' },
                orderBy: 'at',
                order: 'asc',
            }),
    }),
    get: operation({
        description: 'A question, open or answered.',
        input: z.object({ id: z.string() }),
        run: ({ id }) => kept.get({ id }),
    }),
    answer: operation({
        description:
            "The person's answer to an open question, which makes the " +
            'call its choice holds. Only an answer the person gave, never ' +
            "one of Vaulter's own.",
        input: z.object({ id: z.string(), choice: z.string() }),
        run: async ({ id, choice }) => {
            const asked = await kept.get({ id });
            const chosen = asked?.choices.find((c) => c.id === choice);
            if (!chosen) {
                throw new Error(`"${choice}" is not one of its choices`);
            }
            // Closed first, so the same answer given twice makes its call
            // once. If the call fails, the question is open again.
            const answered = await close(id, choice);
            try {
                if (chosen.does) {
                    await call(chosen.does);
                }
            } catch (error) {
                await reopen(id);
                throw error;
            }
            return answered;
        },
    }),
} satisfies Record<string, Operation>;

export const extension = { operations: questions } satisfies Extension;

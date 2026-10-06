// The agent: Vaulter. It hands the model every other extension's operations,
// from the core, as functions named `<extension>__<operation>`, and the model
// calls them until it can answer. One that rewrites what is known is asked
// about first: a question whose yes is the call itself.

import { z } from 'zod';
import {
    type Call,
    type Extension,
    extensions,
    type Loaded,
    type Operation,
    operation,
} from '#core';
import { model } from '#extensions/openai';
import { questions, yesNo } from '#extensions/questions';
import instructions from './instructions.md?raw';

const ID = 'agent';

/** Asks the person whether Vaulter may make `made`. Returns the question's
 * id. */
function askFirst(made: Call, description: string) {
    const input = JSON.stringify(made.input, null, 2);
    return questions.ask({
        from: ID,
        // The same call, asked again while the first is open, is the same
        // question.
        key: JSON.stringify(made),
        title: `May Vaulter use ${made.extension}'s ${made.operation}?`,
        body: `${description}\n\n${input}`.slice(0, 4000),
        choices: yesNo(made),
    });
}

/** `own` as the model calls it: itself, or, if it rewrites what is known,
 * an operation that asks the person whether it may. */
function asCalled(extension: string, name: string, own: Operation) {
    if (!own.rewrites) {
        return own;
    }
    return operation({
        description: `${own.description} (asks the person first)`,
        input: own.input,
        run: async (input) => {
            const made = { extension, operation: name, input };
            return { asked: await askFirst(made, own.description) };
        },
    });
}

/** Every other extension's operations, by the names the model knows them
 * by: `<extension>__<operation>`. */
function fnsOf(loaded: Loaded[]) {
    return Object.fromEntries(
        loaded
            .filter(({ id }) => id !== ID)
            .flatMap(({ id, operations }) =>
                Object.entries(operations).map(([name, own]) => [
                    `${id}__${name}`,
                    asCalled(id, name, own),
                ]),
            ),
    );
}

export const agent = {
    ask: operation({
        description:
            'Ask Vaulter, in words: it answers, using every extension, and ' +
            'says what it called.',
        input: z.object({ prompt: z.string().min(1) }),
        run: async ({ prompt }) => {
            const fns = fnsOf(await extensions());
            return await model.answer({ instructions, prompt, fns });
        },
    }),
} satisfies Record<string, Operation>;

export const extension = { operations: agent } satisfies Extension;

// OpenAI: the language model, through the AI SDK, which only this extension
// uses. Its key is the sealed secret "openai/key".

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, isStepCount, type ToolSet, tool } from 'ai';
import { z } from 'zod';
import { type Extension, type Operation, operation } from '#core';
import { secrets } from '#extensions/secrets';
import type { ModelCall } from './api.ts';

export * from './api.ts';

/** The model it asks. */
const MODEL = 'gpt-6.1-sol';
const MAX_STEPS = 12;

/** A request with no cookies or referrer of the page's own, and no
 * redirect. */
function fetchPlainly(url: RequestInfo | URL, init?: RequestInit) {
    return fetch(url, {
        ...init,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
    });
}

/** The model, with this device's key. */
async function languageModel() {
    const apiKey = await secrets.secret({ name: 'openai/key' });
    if (!apiKey) {
        throw new Error('the OpenAI key is not set: unlock this device');
    }
    return createOpenAI({ apiKey, fetch: fetchPlainly })(MODEL);
}

function isOperation(value: unknown): value is Operation {
    return (
        typeof value === 'function' &&
        'input' in value &&
        'description' in value
    );
}

/** The operations, as the AI SDK's tools, by name. */
function toolsOf(fns: Record<string, Operation>): ToolSet {
    return Object.fromEntries(
        Object.entries(fns).map(([name, own]) => [
            name,
            tool({
                description: own.description,
                inputSchema: own.input,
                execute: (input) => own(input),
            }),
        ]),
    );
}

export const model = {
    answer: operation({
        description:
            'Answers `prompt`, calling the operations in `fns` (by the name ' +
            'the model knows each by, letters, digits and _) as it needs ' +
            'to, for up to `maxSteps` turns. A call that fails goes back ' +
            'to the model as its error.',
        input: z.object({
            instructions: z.string(),
            prompt: z.string(),
            fns: z
                .record(z.string(), z.custom<Operation>(isOperation))
                .default({}),
            maxSteps: z.number().int().positive().default(MAX_STEPS),
        }),
        run: async ({ instructions, prompt, fns, maxSteps }) => {
            const result = await generateText({
                model: await languageModel(),
                instructions,
                prompt,
                tools: toolsOf(fns),
                stopWhen: isStepCount(maxSteps),
            });
            const calls = result.steps.flatMap((step) =>
                step.content.flatMap((part): ModelCall[] => {
                    const { type } = part;
                    if (type === 'tool-result') {
                        const { toolName: name, input, output } = part;
                        return [{ name, input, output }];
                    }
                    if (type === 'tool-error') {
                        const { toolName: name, input, error } = part;
                        return [{ name, input, error: String(error) }];
                    }
                    return [];
                }),
            );
            return { text: result.text, calls };
        },
    }),
} satisfies Record<string, Operation>;

/** The model offers nothing to people or Vaulter: it is what Vaulter is
 * made with. */
export const extension = {} satisfies Extension;

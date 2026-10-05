// OpenAI: the language model, over the Responses API. Its key is the
// sealed secret "openai/key".

import { z } from 'zod';
import { secret } from '#extensions/secrets';
import type { Answer, Call, Fn, Model } from './api.ts';
import {
    bodyOf,
    type Message,
    resultOf,
    type TurnRequest,
} from './responses.ts';

export * from './api.ts';

const API = 'https://api.openai.com/v1';
/** The model it asks. */
const MODEL = 'gpt-6.1-sol';
const MAX_STEPS = 12;
/** How much of a function's output goes back to the model. */
const MAX_OUTPUT = 20_000;

/** One turn with the model. */
async function turn(request: TurnRequest) {
    const key = secret('openai/key');
    if (!key) {
        throw new Error('the OpenAI key is not set: unlock this device');
    }
    // No cookies or referrer of the page's own go with it, and no redirect.
    const response = await fetch(`${API}/responses`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyOf(request, MODEL)),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
    });
    if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
            error?: { message?: string };
        } | null;
        const reason = failure?.error?.message ?? response.statusText;
        throw new Error(`OpenAI ${response.status}: ${reason}`);
    }
    return resultOf(await response.json());
}

/** A function's output as the model gets it, cut if it is long. */
function shown(value: unknown) {
    const text = JSON.stringify(value ?? null);
    if (text.length <= MAX_OUTPUT) {
        return text;
    }
    return `${text.slice(0, MAX_OUTPUT)}… (cut)`;
}

/** Makes one call the model asked for, and returns what came of it. */
async function made(fns: Fn[], name: string, args: string): Promise<Call> {
    const input: unknown = JSON.parse(args || '{}');
    const fn = fns.find((candidate) => candidate.name === name);
    if (!fn) {
        return { name, input, error: `no function ${name}` };
    }
    try {
        return { name, input, output: await fn.call(fn.input.parse(input)) };
    } catch (error) {
        return { name, input, error: (error as Error).message };
    }
}

function toolsOf(fns: Fn[]) {
    return fns.map((fn) => ({
        name: fn.name,
        description: fn.description,
        parameters: z.toJSONSchema(fn.input, {
            io: 'input',
            unrepresentable: 'any',
        }),
    }));
}

export const model: Model = {
    async answer({
        instructions,
        prompt,
        fns = [],
        maxSteps = MAX_STEPS,
        onCall,
    }) {
        const tools = toolsOf(fns);
        const messages: Message[] = [
            { role: 'system', content: instructions },
            { role: 'user', content: prompt },
        ];
        const answer: Answer = {
            text: '',
            calls: [],
            usage: { input: 0, output: 0 },
        };

        for (let step = 0; step < maxSteps; step++) {
            const result = await turn({ messages, tools });
            answer.usage.input += result.usage.input;
            answer.usage.output += result.usage.output;
            messages.push({
                role: 'assistant',
                content: result.content,
                toolCalls: result.toolCalls,
                state: result.state,
            });
            if (!result.toolCalls.length) {
                return { ...answer, text: result.content ?? '' };
            }

            for (const toolCall of result.toolCalls) {
                const call = await made(fns, toolCall.name, toolCall.arguments);
                answer.calls.push(call);
                await onCall?.(call);
                messages.push({
                    role: 'tool',
                    toolCallId: toolCall.id,
                    content: shown(
                        call.error ? { error: call.error } : call.output,
                    ),
                });
            }
        }

        return {
            ...answer,
            text: 'That took too many steps; ask again more narrowly.',
        };
    },

    async json({ instructions, input, schema, name }) {
        const result = await turn({
            messages: [
                { role: 'system', content: instructions },
                { role: 'user', content: JSON.stringify(input) },
            ],
            responseSchema: {
                name,
                schema: z.toJSONSchema(schema) as Record<string, unknown>,
            },
        });
        return schema.parse(JSON.parse(result.content ?? '{}'));
    },
};

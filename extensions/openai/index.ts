// OpenAI: the language model, over the Responses API. Its key is the
// sealed secret "openai/key".

import { z } from 'zod';
import { messageOf } from '#kernel';
import type { Call, Fn } from './api.ts';
import {
    callsIn,
    type FunctionCall,
    type Item,
    respond,
    textIn,
} from './responses.ts';

export * from './api.ts';

/** The model it asks. */
const MODEL = 'gpt-6.1-sol';
const MAX_STEPS = 12;
/** How much of a function's output goes back to the model. */
const MAX_OUTPUT = 20_000;

/** A function's output as the model gets it, cut if it is long. */
function shown(value: unknown) {
    const text = JSON.stringify(value ?? null);
    if (text.length <= MAX_OUTPUT) {
        return text;
    }
    return `${text.slice(0, MAX_OUTPUT)}… (cut)`;
}

/** Makes one call the model asked for, and returns what came of it. A call
 * that fails, for any reason, goes back to the model as its error. */
async function made(fns: Fn[], request: FunctionCall): Promise<Call> {
    const { name } = request;
    let input: unknown = request.arguments;
    try {
        input = JSON.parse(request.arguments || '{}');
        const fn = fns.find((candidate) => candidate.name === name);
        if (!fn) {
            throw new Error(`no function ${name}`);
        }
        return { name, input, output: await fn.call(fn.input.parse(input)) };
    } catch (error) {
        return { name, input, error: messageOf(error) };
    }
}

function toolsOf(fns: Fn[]) {
    return fns.map((fn) => ({
        type: 'function',
        name: fn.name,
        description: fn.description,
        parameters: z.toJSONSchema(fn.input, {
            io: 'input',
            unrepresentable: 'any',
        }),
        // A schema made from Zod isn't always a strict-mode schema, because
        // of its optional fields.
        strict: false,
    }));
}

function opening(instructions: string, prompt: string): Item[] {
    return [
        { role: 'system', content: instructions },
        { role: 'user', content: prompt },
    ];
}

export const model = {
    /** Answers `prompt`, calling `fns` as it needs to, for up to
     * `maxSteps` turns. `onCall` hears each call once it is made. */
    async answer({
        instructions,
        prompt,
        fns = [],
        maxSteps = MAX_STEPS,
        onCall,
    }: {
        instructions: string;
        prompt: string;
        fns?: Fn[];
        maxSteps?: number;
        onCall?: (call: Call) => unknown;
    }) {
        const input = opening(instructions, prompt);
        const tools = fns.length ? toolsOf(fns) : undefined;
        const calls: Call[] = [];
        const usage = { input: 0, output: 0 };

        for (let step = 0; step < maxSteps; step++) {
            const turn = await respond({ model: MODEL, input, tools });
            usage.input += turn.usage.input_tokens;
            usage.output += turn.usage.output_tokens;
            input.push(...turn.output);
            const asked = callsIn(turn.output);
            if (!asked.length) {
                return { text: textIn(turn.output), calls, usage };
            }

            for (const request of asked) {
                const call = await made(fns, request);
                calls.push(call);
                await onCall?.(call);
                input.push({
                    type: 'function_call_output',
                    call_id: request.call_id,
                    output: shown(
                        call.error ? { error: call.error } : call.output,
                    ),
                });
            }
        }

        const text = 'That took too many steps; ask again more narrowly.';
        return { text, calls, usage };
    },

    /** An answer shaped by `schema`, and checked against it. `name` is the
     * answer's name, for the model: "revision". */
    async json<Schema extends z.ZodType>({
        instructions,
        input,
        schema,
        name,
    }: {
        instructions: string;
        input: unknown;
        schema: Schema;
        name: string;
    }): Promise<z.output<Schema>> {
        const turn = await respond({
            model: MODEL,
            input: opening(instructions, JSON.stringify(input)),
            text: {
                format: {
                    type: 'json_schema',
                    name,
                    schema: z.toJSONSchema(schema),
                    strict: false,
                },
            },
        });
        return schema.parse(JSON.parse(textIn(turn.output) || '{}'));
    },
};

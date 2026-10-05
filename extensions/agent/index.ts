// The agent: Vaulter. It hands the model every extension's tools, and the
// model calls them until it can answer.

import { type Fn, model } from '#extensions/openai';
import type { Agent, Step, Tool } from './api.ts';
import { askFirst, tools } from './catalog.ts';
import instructions from './instructions.md?raw';

export * from './api.ts';

/** `tool` as a function the model calls, as `<extension>__<tool>`. */
function fnOf(extension: string, tool: Tool<unknown>): Fn {
    const asks = tool.access === 'ask';
    return {
        name: `${extension}__${tool.name}`,
        description: asks
            ? `${tool.description} (asks the person first)`
            : tool.description,
        input: tool.input,
        async call(input) {
            if (!asks) {
                return tool.run(input);
            }
            const call = { extension, tool: tool.name, input: input as never };
            return { asked: await askFirst(call, tool.description) };
        },
    };
}

function fns(): Fn[] {
    return [...tools()].flatMap(([extension, own]) =>
        [...own.values()].map((tool) => fnOf(extension, tool)),
    );
}

/** A call the model made, as a step: the extension and the tool. */
function stepOf(name: string, call: Omit<Step, 'extension' | 'tool'>): Step {
    // An extension's id has no underscore, so the first __ ends it.
    const split = name.indexOf('__');
    return {
        extension: name.slice(0, split),
        tool: name.slice(split + 2),
        ...call,
    };
}

export const agent: Agent = {
    async ask(request, onStep) {
        const steps: Step[] = [];
        const answer = await model.answer({
            instructions,
            prompt: request.prompt,
            fns: fns(),
            async onCall({ name, ...call }) {
                const step = stepOf(name, call);
                steps.push(step);
                await onStep?.(step);
            },
        });
        return { text: answer.text, steps, usage: answer.usage };
    },
};

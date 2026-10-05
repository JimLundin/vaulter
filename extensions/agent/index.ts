// The agent: Vaulter. It hands the model every extension's tools, as
// functions named `<extension>__<tool>`, and the model calls them until it
// can answer.

import { type Call, type Fn, model } from '#extensions/openai';
import type { Tool } from './api.ts';
import { askFirst, tools } from './catalog.ts';
import instructions from './instructions.md?raw';

export * from './api.ts';

function fnOf(extension: string, tool: Tool): Fn {
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
            const call = { extension, tool: tool.name, input };
            return { asked: await askFirst(call, tool.description) };
        },
    };
}

function fns() {
    return [...tools()].flatMap(([extension, own]) =>
        [...own.values()].map((tool) => fnOf(extension, tool)),
    );
}

export const agent = {
    /** Answers `prompt` with every extension's tools. `onCall` hears each
     * call the model makes. */
    ask(prompt: string, onCall?: (call: Call) => unknown) {
        return model.answer({ instructions, prompt, fns: fns(), onCall });
    },
};

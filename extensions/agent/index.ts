// The agent: Vaulter. It hands the model the extensions' tools, as functions
// named `<extension>__<tool>`, and the model calls them until it can answer.
// A tool that asks first becomes a question on the agent's own topic,
// holding the call, and the person's yes makes it, also after a restart.

import { z } from 'zod';
import { type Call, type Fn, model } from '#extensions/openai';
import { questionsFor, YES_NO } from '#extensions/questions';
import { tools as wikiTools } from '#extensions/wiki';
import type { Tool } from './api.ts';
import instructions from './instructions.md?raw';

export * from './api.ts';

/** A call Vaulter asked to make, as its question keeps it. */
const Asked = z.object({
    extension: z.string(),
    tool: z.string(),
    input: z.unknown(),
});
type Asked = z.infer<typeof Asked>;

/** Every tool Vaulter has, with the extension it comes from. */
const TOOLS = [...wikiTools.map((tool) => ({ extension: 'wiki', tool }))];

const TOPIC = 'approve';
const questions = questionsFor('agent');

function findTool(extension: string, name: string) {
    return TOOLS.find(
        (entry) => entry.extension === extension && entry.tool.name === name,
    )?.tool;
}

/** Asks the person whether Vaulter may make `call`. Returns the
 * question's id. */
function askFirst(call: Asked, description: string) {
    const input = JSON.stringify(call.input, null, 2);
    return questions.ask({
        topic: TOPIC,
        // The same call, asked again while the first is open, is the same
        // question.
        key: JSON.stringify(call),
        title: `May Vaulter use ${call.extension}'s ${call.tool}?`,
        body: `${description}\n\n${input}`.slice(0, 4000),
        choices: YES_NO,
        data: call,
    });
}

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

const FNS = TOOLS.map(({ extension, tool }) => fnOf(extension, tool));

await questions.handle(TOPIC, async (answer, question) => {
    if (answer.choice !== 'yes') {
        return;
    }
    const call = Asked.parse(question.data);
    const tool = findTool(call.extension, call.tool);
    if (!tool) {
        throw new Error(`${call.extension} has no tool ${call.tool}`);
    }
    await tool.run(tool.input.parse(call.input));
});

export const agent = {
    /** Answers `prompt` with every tool. `onCall` hears each call the model
     * makes. */
    ask(prompt: string, onCall?: (call: Call) => unknown) {
        return model.answer({ instructions, prompt, fns: FNS, onCall });
    },
};

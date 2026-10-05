// The tools Vaulter has, and the person's approval of those that ask first.
// Such a call becomes a question on the agent's own topic, holding the call,
// and a yes makes it, also after a restart.

import { z } from 'zod';
import { questionsFor, YES_NO } from '#extensions/questions';
import { extensions, started } from '#kernel';
import type { Tool } from './api.ts';

/** A call Vaulter asked to make, as its question keeps it. */
const Asked = z.object({
    extension: z.string(),
    tool: z.string(),
    input: z.unknown(),
});
type Asked = z.infer<typeof Asked>;

const TOPIC = 'approve';
/** A tool's name goes to the model inside the function's name. */
const TOOL_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
const questions = questionsFor('agent');

function hasToolName(tool: Tool) {
    return TOOL_NAME.test(tool.name) && !tool.name.includes('__');
}

/** Every extension's tools, by extension and name, as they are now. */
export function tools() {
    const byExtension = new Map<string, Map<string, Tool>>();
    for (const { id, exports } of extensions()) {
        if (!Array.isArray(exports.tools)) {
            continue;
        }
        // An agreed export is trusted as its type, as any import is.
        const own: Tool[] = exports.tools;
        const named = own.filter(hasToolName);
        byExtension.set(id, new Map(named.map((tool) => [tool.name, tool])));
    }
    return byExtension;
}

/** Asks the person whether Vaulter may make `call`. Returns the
 * question's id. */
export function askFirst(call: Asked, description: string) {
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

async function approved(data: unknown) {
    // An answer kept from before the last restart can arrive while the
    // extension with the tool is still starting.
    await started;
    const call = Asked.parse(data);
    const tool = tools().get(call.extension)?.get(call.tool);
    if (!tool) {
        throw new Error(`${call.extension} has no tool ${call.tool}`);
    }
    await tool.run(tool.input.parse(call.input));
}

// Not awaited: this extension is among those `approved` waits for.
void questions.handle(TOPIC, async (answer, question) => {
    if (answer.choice === 'yes') {
        await approved(question.data);
    }
});

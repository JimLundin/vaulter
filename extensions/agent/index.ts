// The agent (agent@1): Vaulter. It takes the tools every extension adds (agent.tools), reads each
// extension's guide from the kernel, and answers with a model (ai.chat). A tool that asks first becomes
// a question (questions@1) whose yes runs it, also after a restart; without questions it can't run.

import { agent } from '#contracts/agent';
import { type AgentToolsV1, agentTools, type Tool } from '#contracts/agent.tools';
import { chat } from '#contracts/ai.chat';
import { kernel } from '#contracts/kernel';
import { questions } from '#contracts/questions';
import { defineExtension, perCaller } from '#kernel';
import { catalog } from './catalog.ts';
import { ask } from './loop.ts';

export default defineExtension({
  id: 'agent',
  version: '1.0.0',
  provides: { agent, agentTools },
  requires: { chat },
  optional: { kernel, questions },
  agentGuide: 'Vaulter itself.',
  setup({ chat, kernel, questions }) {
    let guides: Promise<Map<string, string>> | undefined;
    const guide = async (ext: string) => {
      guides ??= (kernel?.extensions() ?? Promise.resolve([])).then(
        (list) => new Map(list.map((e) => [e.id, e.agentGuide])),
      );
      return (await guides).get(ext) || 'no guide';
    };
    const held = catalog(guide, questions);
    // Not awaited: an answer waiting from before may wait for its tool, which an extension starting
    // after this one adds.
    void held.listen();

    const toolsFor = (from: string): AgentToolsV1 => ({
      add(added) {
        // A tool's name goes to the model as part of the function's name.
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(added.name) || added.name.includes('__'))
          throw new Error(`"${added.name}" is not a tool name: letters, digits and single _`);
        return Promise.resolve(held.add(from, added as Tool<unknown>));
      },
    });
    return {
      agentTools: perCaller(toolsFor, {
        forget: (caller) => {
          held.tools.delete(caller);
        },
      }),
      agent: {
        ask: (req, onStep) => ask(chat, held, req, onStep),
      },
    };
  },
});

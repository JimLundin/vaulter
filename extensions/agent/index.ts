// The agent (agent@1): Vaulter. It takes the tools every extension adds (agent.tools), reads each
// extension's guide from the kernel, and answers with a model (ai.chat). It holds no access of its own:
// every tool call goes through the kernel, which applies the tool's level.
import { defineExtension, perCaller } from '@vaulter/kernel';
import { agent } from '@contracts/agent';
import { type AgentToolsV1, agentTools, type HeldTool } from '@contracts/agent.tools';
import { chat } from '@contracts/ai.chat';
import { kernel } from '@contracts/kernel';
import { ask } from './loop.ts';

export default defineExtension({
  id: 'agent',
  version: '1.0.0',
  provides: { agent, agentTools },
  requires: { chat },
  optional: { kernel },
  agentGuide: 'Vaulter itself.',
  setup({ chat, kernel }) {
    const tools = new Map<string, Map<string, HeldTool>>();
    const tools_ = (from: string): AgentToolsV1 => ({
      add(added) {
        // A tool's name goes to the model as part of the function's name.
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(added.name) || added.name.includes('__'))
          throw new Error(`"${added.name}" is not a tool name: letters, digits and single _`);
        const tool = added as unknown as HeldTool;
        const mine = tools.get(from) ?? new Map<string, HeldTool>();
        tools.set(from, mine);
        mine.set(tool.name, tool);
        return Promise.resolve(() => {
          if (mine.get(tool.name) === tool) mine.delete(tool.name);
        });
      },
    });
    let guides: Promise<Map<string, string>> | undefined;
    const guide = async (ext: string) => {
      guides ??= (kernel?.extensions() ?? Promise.resolve([])).then(
        (list) => new Map(list.map((e) => [e.id, e.agentGuide])),
      );
      return (await guides).get(ext) || 'no guide';
    };

    return {
      agentTools: perCaller(tools_, {
        forget: (caller) => {
          tools.delete(caller);
        },
      }),
      agent: {
        ask: (req, onStep) => ask(chat, { tools: () => tools, guide }, req, onStep),
      },
    };
  },
});

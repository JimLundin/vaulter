// The agent (agent@1): Pip. It takes the tools every extension adds (agent.tools), reads each
// extension's guide from the kernel, and answers with a model (ai.chat). It holds no access of its own:
// every tool call goes through the kernel, which applies the tool's level.
import { defineExtension, perCaller } from '@pip/kernel';
import { agent } from '@contracts/agent';
import { type AgentToolsWire, agentTools, type WireTool } from '@contracts/agent.tools';
import { chat } from '@contracts/ai.chat';
import { kernel } from '@contracts/kernel';
import { ask } from './loop.ts';

export default defineExtension({
  id: 'agent',
  version: '1.0.0',
  provides: { agent, agentTools },
  requires: { chat },
  optional: { kernel },
  agentGuide: 'Pip itself.',
  setup({ chat, kernel }) {
    const tools = new Map<string, Map<string, WireTool>>();
    const tools_ = (from: string): AgentToolsWire => ({
      add(tool) {
        const mine = tools.get(from) ?? new Map<string, WireTool>();
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

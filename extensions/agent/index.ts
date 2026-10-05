// The agent: Vaulter. It takes the tools every extension exports, reads each extension's guide, and
// answers with a model (#chat). A tool that asks first becomes a question whose yes runs it, also after
// a restart.

import { chat } from '#chat';
import type { AgentV1 } from '#contracts/agent';
import { ask } from './loop.ts';

export const agent: AgentV1 = {
  ask: (req, onStep) => ask(chat, req, onStep),
};

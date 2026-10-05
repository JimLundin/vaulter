// The agent: Vaulter. It takes the tools every extension exports, and answers with a model (openai). A tool that asks first becomes a question whose yes runs it, also after
// a restart.

import { chat } from '#extensions/openai';
import type { Agent } from './api.ts';
import { ask } from './loop.ts';

export * from './api.ts';

export const agent: Agent = {
  ask: (req, onStep) => ask(chat, req, onStep),
};

// Tools for Vaulter: what an extension lets Vaulter do, written once and used by both the screens and Vaulter
// (ARCHITECTURE.md, "How Vaulter uses extensions"). The agent provides it; an extension adds tools with a
// Zod input and an access level, and the agent hands the input to the model as JSON Schema, checks
// what the model sends against it, and applies the level to every call.

import type { z } from 'zod';
import { defineContract, type Unsubscribe } from '#kernel';

/** What Vaulter may do with a tool on its own:
 *   read   run it
 *   write  run it, and say so in the answer's steps
 *   ask    ask the person first (questions@1): it runs when they say yes */
export type Access = 'read' | 'write' | 'ask';

export interface Tool<I> {
  /** Unique within the extension: "findPages". Letters, digits and _. */
  name: string;
  /** For Vaulter: what it does and when to use it. */
  description: string;
  access: Access;
  input: z.ZodType<I>;
  run: (input: I) => unknown | Promise<unknown>;
}

export interface AgentToolsV1 {
  add: <I>(tool: Tool<I>) => Promise<Unsubscribe>;
}

export const agentTools = defineContract<AgentToolsV1>({ name: 'agent.tools', version: 1 });

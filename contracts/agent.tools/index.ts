// Tools for Pip: what an extension lets Pip do, written once and used by both the screens and Pip
// (ARCHITECTURE.md, "How Pip uses extensions"). The agent provides it; an extension adds tools with a
// Zod input and an access level, and the agent hands the input to the model as JSON Schema and checks
// what the model sends against it. The contract guards `run` with the tool's level, so the kernel
// applies read, write or ask to every call Pip makes, whatever the adding extension's copy of this
// contract says.
import { type Access, defineContract, type Guarded } from '@pip/kernel';
import type { z } from 'zod';

export type Unsubscribe = () => void;

export interface Tool<I> {
  /** Unique within the extension: "findEntity". Letters, digits and _. */
  name: string;
  /** For Pip: what it does and when to use it. */
  description: string;
  /** The level it declares; the person's setting may change it. */
  access: Access;
  input: z.ZodType<I>;
  run: (input: I) => unknown | Promise<unknown>;
}

/** A tool as the agent holds it: `run` guarded by the kernel, `run.level` the level applied now. */
export type HeldTool = Omit<Tool<unknown>, 'run'> & {
  run: Guarded<(input: unknown) => Promise<unknown>>;
};

export interface AgentToolsV1 {
  add: <I>(tool: Tool<I>) => Promise<Unsubscribe>;
}

export const agentTools = defineContract<AgentToolsV1>({
  name: 'agent.tools',
  version: '1.0.0',
  guards: {
    add: {
      arg: 0,
      fn: 'run',
      guard: (t: Tool<unknown>) => ({ label: `tool:${t.name}`, access: t.access }),
    },
  },
});

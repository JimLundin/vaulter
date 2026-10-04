// Tools for Pip: what an extension lets Pip do, written once and used by both the screens and Pip
// (ARCHITECTURE.md, "How Pip uses extensions"). The agent provides it; an extension adds tools with a
// Zod input and an access level. The client turns the input into JSON Schema (what a model reads); the
// inputs guard `run` with its level, so the kernel applies read, write or ask to every call Pip makes,
// whatever the adding extension's copy of this contract does.
import { type Access, defineContract, func, type Guarded, guardedObject } from '@pip/kernel';
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;
export type Unsubscribe = () => void;

export interface Tool<I> {
  /** Unique within the extension: "findEntity". */
  name: string;
  /** For Pip: what it does and when to use it. */
  description: string;
  access: Access;
  input: z.ZodType<I>;
  run: (input: I) => unknown | Promise<unknown>;
}

/** A tool as the extension adds it. */
export interface WireTool {
  name: string;
  description: string;
  /** The level it declares; the person's setting may change it. */
  access: Access;
  input: JsonSchema;
  run: (input: unknown) => Promise<unknown>;
}

/** A tool as the agent receives it: `run.level` is the level the kernel applies now. */
export type HeldTool = Omit<WireTool, 'run'> & { run: Guarded<WireTool['run']> };

export interface AgentToolsV1 {
  add: <I>(tool: Tool<I>) => Promise<Unsubscribe>;
}

export interface AgentToolsWire {
  /** The provider gets the tool with `run` guarded by the kernel. */
  add: (tool: HeldTool) => Promise<Unsubscribe>;
}

const Name = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, { message: 'a tool name: letters, digits, _' });

export const agentTools = defineContract<AgentToolsV1, AgentToolsWire>({
  name: 'agent.tools',
  version: '1.0.0',
  inputs: {
    add: z.tuple([
      guardedObject(
        {
          name: Name,
          description: z.string().min(1).max(2000),
          access: z.enum(['read', 'write', 'ask']),
          input: z.record(z.string(), z.unknown()),
          run: func<WireTool['run']>(),
        },
        { fn: 'run', access: 'access', label: (t) => `tool:${t.name}` },
      ),
    ]),
  },
  client: (remote) => ({
    add: (tool) =>
      remote.add({
        name: Name.parse(tool.name),
        description: tool.description,
        access: tool.access,
        input: z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as JsonSchema,
        // What reaches the tool is what it declared.
        run: (async (input: unknown) => tool.run(tool.input.parse(input))) as HeldTool['run'],
      }),
  }),
});

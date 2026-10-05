// Vaulter itself: ask in words, and it uses the extensions' tools to answer or to act. An extension
// exports `tools`, each with a Zod input and an access level; the agent hands the input to the model as
// JSON Schema, checks what the model sends against it, and applies the level to every call: read and
// write run, ask asks the person first, as a question, and runs when they say yes.

import type { z } from 'zod';

export interface AskRequest {
  prompt: string;
}

export type Step =
  | { kind: 'open'; extension: string }
  | {
      kind: 'tool';
      extension: string;
      tool: string;
      input: unknown;
      output?: unknown;
      error?: string;
    };

export interface Answer {
  text: string;
  steps: Step[];
  usage: { input: number; output: number };
}

export interface Agent {
  ask: (req: AskRequest, onStep?: (step: Step) => void) => Promise<Answer>;
}

/** What Vaulter may do with a tool on its own:
 *   read   run it
 *   write  run it, and say so in the answer's steps
 *   ask    ask the person first (a question): it runs when they say yes */
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

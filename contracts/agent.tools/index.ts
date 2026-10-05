// Tools for Vaulter: what an extension lets Vaulter do, written once and used by both the screens and Vaulter
// (ARCHITECTURE.md, "How Vaulter uses extensions"). An extension exports `tools`, each with a Zod input
// and an access level; the agent hands the input to the model as JSON Schema, checks what the model
// sends against it, and applies the level to every call.

import type { z } from 'zod';

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

/** A tool as a list of tools holds it, whatever its input. */
export const tool = <I>(t: Tool<I>) => t as unknown as Tool<unknown>;

// Vaulter itself. Ask in words, and it uses the extensions' tools to answer
// or to act.

import type { z } from 'zod';

/**
 * What Vaulter may do with a tool on its own:
 *   read   run it
 *   write  run it, and show it in the answer's calls
 *   ask    ask the person first, and run it when they say yes
 */
export type Access = 'read' | 'write' | 'ask';

/** What an extension lets Vaulter do. An extension exports its tools as
 * `tools`. */
export interface Tool<Input extends z.ZodType = z.ZodType> {
    /** Unique within the extension, such as "findPages". Letters, digits and
     * single underscores. */
    name: string;
    /** For the model: what it does, and when to use it. */
    description: string;
    access: Access;
    /** What the model must send. */
    input: Input;
    // A method, so that a tool of any input fits a list of tools. The agent
    // checks the input against `input` before every run.
    run(input: z.output<Input>): unknown;
}

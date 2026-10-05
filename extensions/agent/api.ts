// Vaulter itself. Ask in words, and it uses the extensions' tools to answer
// or to act.

import type { z } from 'zod';

export interface AskRequest {
    prompt: string;
}

/** A tool call Vaulter made, with what came of it. */
export interface Step {
    extension: string;
    tool: string;
    input: unknown;
    output?: unknown;
    error?: string;
}

export interface Answer {
    text: string;
    steps: Step[];
    usage: { input: number; output: number };
}

export interface Agent {
    ask: (
        request: AskRequest,
        onStep?: (step: Step) => void,
    ) => Promise<Answer>;
}

/**
 * What Vaulter may do with a tool on its own:
 *   read   run it
 *   write  run it, and show it in the answer's steps
 *   ask    ask the person first, and run it when they say yes
 */
export type Access = 'read' | 'write' | 'ask';

/** What an extension lets Vaulter do. An extension exports its tools as
 * `tools`. */
export interface Tool<I> {
    /** Unique within the extension, such as "findPages". Letters, digits and
     * single underscores. */
    name: string;
    /** For the model: what it does, and when to use it. */
    description: string;
    access: Access;
    /** What the model must send. It is checked before `run`. */
    input: z.ZodType<I>;
    run: (input: I) => unknown;
}

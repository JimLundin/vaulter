// The language model, for what its users do with it: answer a prompt,
// calling the functions it is given (the agent), or give a structured
// answer (the wiki). The wire format and the turns stay inside.

import type { z } from 'zod';

/** A function the model may call: what it does, what it takes, and what calling
 * it does. */
export interface Fn {
    /** Letters, digits and _: it goes to the model as the function's name. */
    name: string;
    /** For the model: what it does and when to use it. */
    description: string;
    /** Checked before `call`: what the model sends is untyped. */
    input: z.ZodType;
    call: (input: unknown) => unknown;
}

/** A call the model made, with what came of it. */
export interface Call {
    name: string;
    input: unknown;
    output?: unknown;
    error?: string;
}

export interface Answer {
    text: string;
    calls: Call[];
    usage: { input: number; output: number };
}

export interface Model {
    /** Answers `prompt`, calling `fns` as it needs to, for up to `maxSteps`
     * turns; `onCall` hears each call once it is made. A call that fails goes
     * back to the model as its error. */
    answer: (req: {
        instructions: string;
        prompt: string;
        fns?: Fn[];
        maxSteps?: number;
        onCall?: (call: Call) => unknown;
    }) => Promise<Answer>;
    /** An answer shaped by `schema`, and checked against it. */
    json: <T>(req: {
        instructions: string;
        input: unknown;
        schema: z.ZodType<T>;
        /** The answer's name, for the model: "revision". */
        name: string;
    }) => Promise<T>;
}

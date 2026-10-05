// The language model, for what its users do with it: answer a prompt,
// calling the functions it is given (the agent), or give a structured
// answer (the wiki). The wire format and the turns stay inside.

import type { z } from 'zod';

/** A function the model may call: what it does, what it takes, and what
 * calling it does. */
export interface Fn<Input extends z.ZodType = z.ZodType> {
    /** Letters, digits and _: it goes to the model as the function's name. */
    name: string;
    /** For the model: what it does and when to use it. */
    description: string;
    /** What the model sends is checked against it before `call`. */
    input: Input;
    // A method, so that a function of any input fits a list of them. The
    // model checks the input against `input` before every call.
    call(input: z.output<Input>): unknown;
}

/** A call the model made, with what came of it. */
export interface Call {
    name: string;
    input: unknown;
    output?: unknown;
    error?: string;
}

// The language model, for what its users do with it: answer a prompt,
// calling the operations it is given. How it talks to OpenAI stays inside.

/** A call the model made, with what came of it. */
export interface ModelCall {
    name: string;
    input: unknown;
    output?: unknown;
    error?: string;
}

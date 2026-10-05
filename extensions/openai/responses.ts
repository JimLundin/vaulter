// OpenAI's Responses API, one turn at a time. Nothing is stored at OpenAI
// (store: false), so the conversation is the API's own items: each turn's
// output, with the model's encrypted reasoning, goes back with the next.

import { z } from 'zod';
import { secret } from '#extensions/secrets';

/** An item of the conversation, kept as the API sent it. */
export type Item = Record<string, unknown>;

const API = 'https://api.openai.com/v1';

// What the API answers, checked as it comes in. Output items keep every
// field, since they go back to the API unchanged.
const Response = z.object({
    output: z.array(z.looseObject({ type: z.string() })),
    usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});
const FunctionCall = z.object({
    type: z.literal('function_call'),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
});
const Message = z.object({
    type: z.literal('message'),
    content: z.array(z.looseObject({ type: z.string(), text: z.unknown() })),
});
const Failure = z.object({ error: z.object({ message: z.string() }) });

export type FunctionCall = z.infer<typeof FunctionCall>;

/** One turn with the model: `body` is the request, less what every turn
 * sends. */
export async function respond(body: Record<string, unknown>) {
    const key = secret('openai/key');
    if (!key) {
        throw new Error('the OpenAI key is not set: unlock this device');
    }
    // No cookies or referrer of the page's own go with it, and no redirect.
    const response = await fetch(`${API}/responses`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            ...body,
            store: false,
            include: ['reasoning.encrypted_content'],
        }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
    });
    const answer: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const reason =
            Failure.safeParse(answer).data?.error.message ??
            response.statusText;
        throw new Error(`OpenAI ${response.status}: ${reason}`);
    }
    return Response.parse(answer);
}

/** The calls the model asked for in `output`. */
export function callsIn(output: Item[]) {
    return output.flatMap((item) => FunctionCall.safeParse(item).data ?? []);
}

/** The text of the messages in `output`. */
export function textIn(output: Item[]) {
    return output
        .flatMap((item) => Message.safeParse(item).data?.content ?? [])
        .filter((part) => part.type === 'output_text')
        .map((part) => String(part.text))
        .join('');
}

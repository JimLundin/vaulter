import { expect, it } from 'vitest';
import { z } from 'zod';
import { seal } from '../../../extensions/secrets/sealed.ts';
import { servePage, startApp } from '../../app.ts';

// The model's first turn: its reasoning, and a call to findPages.
const CALLS = {
    output: [
        {
            type: 'reasoning',
            id: 'rs_1',
            encrypted_content: 'xyz',
            summary: [],
        },
        {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'findPages',
            arguments: '{"query":"Ada"}',
        },
    ],
    usage: { input_tokens: 12, output_tokens: 7 },
};
const says = (text: string) => ({
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
    usage: { input_tokens: 3, output_tokens: 2 },
});

/** OpenAI, answering with `replies` in turn; what each request sent, and with
 * what key. */
async function openai(replies: unknown[]) {
    const seen: {
        auth: string | null;
        body: { input: unknown; [k: string]: unknown };
    }[] = [];
    servePage(
        await seal(
            'pw-pw-pw-pw-pw-pw',
            { 'openai/key': 'sk-test' },
            { iterations: 1000 },
        ),
        (_url, init) => {
            seen.push({
                auth: new Headers(init?.headers).get('Authorization'),
                body: JSON.parse(String(init?.body)),
            });
            return Promise.resolve(Response.json(replies[seen.length - 1]));
        },
    );
    await startApp(['secrets', 'openai']);
    await (await import('#extensions/secrets')).unlock('pw-pw-pw-pw-pw-pw');
    return { model: (await import('#extensions/openai')).model, seen };
}

it('calls functions, sending its reasoning back each turn', async () => {
    const { model, seen } = await openai([
        CALLS,
        says('Ada Lovelace, a friend.'),
    ]);
    const asked: unknown[] = [];
    const answer = await model.answer({
        instructions: 'Be brief.',
        prompt: 'Who is Ada?',
        fns: [
            {
                name: 'findPages',
                description: 'Find',
                input: z.object({ query: z.string() }),
                call: (input) => {
                    asked.push(input);
                    return { name: 'Ada Lovelace' };
                },
            },
        ],
    });

    expect(answer).toEqual({
        text: 'Ada Lovelace, a friend.',
        calls: [
            {
                name: 'findPages',
                input: { query: 'Ada' },
                output: { name: 'Ada Lovelace' },
            },
        ],
        usage: { input: 15, output: 9 },
    });
    expect(asked).toEqual([{ query: 'Ada' }]);
    expect(seen.every((s) => s.auth === 'Bearer sk-test')).toBe(true);
    const [first, second] = seen.map((s) => s.body);
    expect(first).toMatchObject({
        model: 'gpt-6.1-sol',
        store: false,
        include: ['reasoning.encrypted_content'],
        tools: [{ type: 'function', name: 'findPages', strict: false }],
        input: [
            { role: 'system', content: 'Be brief.' },
            { role: 'user', content: 'Who is Ada?' },
        ],
    });
    // The reasoning item goes back with the call, unchanged, then the
    // function's output.
    expect(second.input).toEqual([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Who is Ada?' },
        ...CALLS.output,
        {
            type: 'function_call_output',
            call_id: 'call_1',
            output: '{"name":"Ada Lovelace"}',
        },
    ]);
});

it('gives a structured answer, checked against its schema', async () => {
    const { model } = await openai([
        says('{"name":"Ada"}'),
        says('{"name":3}'),
    ]);
    const schema = z.object({ name: z.string() });
    const ask = () =>
        model.json({
            instructions: 'Name them.',
            input: {},
            schema,
            name: 'person',
        });
    expect(await ask()).toEqual({ name: 'Ada' });
    await expect(ask()).rejects.toThrow();
});

it('sends a call it cannot make back to the model as its error', async () => {
    const call = (name: string, args: string) => ({
        output: [
            {
                type: 'function_call',
                call_id: `call_${name}`,
                name,
                arguments: args,
            },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
    });
    const { model, seen } = await openai([
        call('findPages', '{"query":'),
        call('nowhere', '{}'),
        says('Sorry.'),
    ]);
    const answer = await model.answer({
        instructions: 'Be brief.',
        prompt: 'Who is Ada?',
        fns: [
            {
                name: 'findPages',
                description: 'Find',
                input: z.object({ query: z.string() }),
                call: () => [],
            },
        ],
    });

    expect(answer.text).toBe('Sorry.');
    expect(answer.calls.map((made) => made.error !== undefined)).toEqual([
        true,
        true,
    ]);
    expect(seen[2].body.input).toContainEqual({
        type: 'function_call_output',
        call_id: 'call_nowhere',
        output: '{"error":"no function nowhere"}',
    });
});

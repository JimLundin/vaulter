// The OpenAI extension: what it does with the model's answers (through a
// fake model in the AI SDK's place), and how it asks OpenAI itself.
import { MockLanguageModelV4 } from 'ai/test';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { operation } from '#core';
import { seal } from '../../../extensions/secrets/sealed.ts';
import { restart, servePage } from '../../app.ts';

const PASSWORD = 'pw-pw-pw-pw-pw-pw';
type Reply = { text: string } | { call: string; input: unknown };

/** A model that answers with `replies`, one per turn. */
function fakeModel(replies: Reply[]) {
    let turn = 0;
    return new MockLanguageModelV4({
        doGenerate() {
            const reply = replies[turn++];
            const usage = {
                inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                },
                outputTokens: { total: 1, text: 1, reasoning: undefined },
            };
            if ('text' in reply) {
                return Promise.resolve({
                    content: [{ type: 'text', text: reply.text }],
                    finishReason: { unified: 'stop', raw: undefined },
                    usage,
                    warnings: [],
                });
            }
            return Promise.resolve({
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: `call_${turn}`,
                        toolName: reply.call,
                        input: JSON.stringify(reply.input),
                    },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
                usage,
                warnings: [],
            });
        },
    });
}

/** The page with an OpenAI key sealed into it, unlocked, and every request
 * to OpenAI kept and refused. */
async function page() {
    const seen: { url: string; init?: RequestInit }[] = [];
    servePage(
        await seal(PASSWORD, { 'openai/key': 'sk-test' }, { iterations: 1000 }),
        (url, init) => {
            seen.push({ url: String(url), init });
            return Promise.resolve(
                Response.json({ error: { message: 'no' } }, { status: 401 }),
            );
        },
    );
    restart();
    const { secrets } = await import('#extensions/secrets');
    await secrets.unlock({ password: PASSWORD });
    return { seen, ...(await import('#extensions/openai')) };
}

/** The OpenAI extension, with `replies` as the model's. */
async function answering(replies: Reply[]) {
    const fake = fakeModel(replies);
    // The provider's own name for its factory, which no naming rule fits.
    vi.doMock('@ai-sdk/openai', () =>
        Object.fromEntries([['createOpenAI', () => () => fake]]),
    );
    const openai = await page();
    vi.doUnmock('@ai-sdk/openai');
    return openai.model;
}

it('needs this device to have opened its secrets', async () => {
    restart();
    const { model } = await import('#extensions/openai');
    await expect(
        model.answer({ instructions: '', prompt: 'Hi' }),
    ).rejects.toThrow('unlock this device');
});

it("asks OpenAI with the key, and nothing of the page's own", async () => {
    const { model, seen } = await page();
    await expect(
        model.answer({ instructions: '', prompt: 'Hi' }),
    ).rejects.toThrow();
    const [{ url, init }] = seen;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer sk-test',
    );
    expect(init).toMatchObject({
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
    });
});

it('calls operations, and sends a failed call back as its error', async () => {
    const model = await answering([
        { call: 'findPages', input: { query: 'Ada' } },
        { call: 'findPages', input: { query: 3 } },
        { text: 'Ada Lovelace, a friend.' },
    ]);
    const asked: unknown[] = [];
    const answer = await model.answer({
        instructions: 'Be brief.',
        prompt: 'Who is Ada?',
        fns: {
            findPages: operation({
                description: 'Find',
                input: z.object({ query: z.string() }),
                run: (input) => {
                    asked.push(input);
                    return { name: 'Ada Lovelace' };
                },
            }),
        },
    });

    expect(answer.text).toBe('Ada Lovelace, a friend.');
    expect(asked).toEqual([{ query: 'Ada' }]);
    expect(answer.calls).toMatchObject([
        { name: 'findPages', output: { name: 'Ada Lovelace' } },
        { name: 'findPages', error: expect.any(String) },
    ]);
});

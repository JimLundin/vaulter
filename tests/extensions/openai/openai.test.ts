import { expect, it } from 'vitest';
import { seal } from '../../../extensions/secrets/sealed.ts';
import { servePage, startApp } from '../../app.ts';

const RESPONSE = {
  model: 'gpt-6.1-sol',
  status: 'completed',
  output: [
    { type: 'reasoning', id: 'rs_1', encrypted_content: 'xyz', summary: [] },
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

it('speaks the Responses API, with the key attached by the secrets extension', async () => {
  const seen: { url: string; auth: string | null; body: unknown }[] = [];
  const fake = ((url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ url, auth: new Headers(init?.headers).get('Authorization'), body });
    return Promise.resolve(
      url.endsWith('/responses')
        ? Response.json(RESPONSE)
        : Response.json({ error: { message: 'nope' } }, { status: 400 }),
    );
  }) as typeof fetch;
  // The secrets extension makes the requests, attaching the key: the network is a fake here.
  servePage(
    await seal('pw-pw-pw-pw-pw-pw', { 'openai/key': 'sk-test' }, { iterations: 1000 }),
    fake,
  );
  await startApp(['secrets', 'openai']);
  await (await import('#extensions/secrets')).unlock('pw-pw-pw-pw-pw-pw');
  const ai = (await import('#extensions/openai')).chat;
  const reply = await ai.complete({
    messages: [
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Who is Ada?' },
    ],
    tools: [{ name: 'findPages', description: 'Find', parameters: { type: 'object' } }],
  });
  await ai.complete({
    messages: [
      { role: 'user', content: 'Who is Ada?' },
      { role: 'assistant', content: null, toolCalls: reply.toolCalls, state: reply.state },
      { role: 'tool', toolCallId: 'call_1', content: '{"name":"Ada Lovelace"}' },
    ],
  });

  expect(reply).toMatchObject({
    content: null,
    toolCalls: [{ id: 'call_1', name: 'findPages', arguments: '{"query":"Ada"}' }],
    usage: { input: 12, output: 7 },
  });
  expect(seen.every((s) => s.auth === 'Bearer sk-test')).toBe(true);
  const [first, second] = seen.map((s) => s.body as { input: unknown });
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
  // The reasoning item goes back with the tool call, unchanged, then the tool's output.
  expect(second.input).toEqual([
    { role: 'user', content: 'Who is Ada?' },
    ...RESPONSE.output,
    { type: 'function_call_output', call_id: 'call_1', output: '{"name":"Ada Lovelace"}' },
  ]);
});

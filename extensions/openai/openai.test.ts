import { afterEach, expect, it, vi } from 'vitest';
import { net } from '#contracts/net';
import { defineContract } from '../../src/kernel/contract.ts';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(() => {
  kernel?.dispose();
  vi.unstubAllGlobals();
});

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
  const fetchImpl = ((url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ url, auth: new Headers(init?.headers).get('Authorization'), body });
    return Promise.resolve(
      url.endsWith('/responses')
        ? Response.json(RESPONSE)
        : Response.json({ error: { message: 'nope' } }, { status: 400 }),
    );
  }) as typeof fetch;
  // The secrets extension makes the requests, attaching the key: the network is a fake here.
  vi.stubGlobal('fetch', fetchImpl);

  const r = await startRepo(['secrets', 'openai'], {
    'contracts/probe/index.ts': `import { defineContract } from '#kernel';
        export const probe = defineContract<{ run(): Promise<unknown> }>({ name: 'probe', version: 1 });`,
    'extensions/probe/index.ts': `import { defineExtension } from '#kernel';
        import { chat } from '#contracts/ai.chat';
        import { probe } from '#contracts/probe';
        export default defineExtension({ id: 'probe', version: '1.0.0', requires: { chat }, provides: { probe },
          setup({ chat }) { return { probe: { async run() {
            const first = await chat.complete({
              messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Who is Ada?' }],
              tools: [{ name: 'findPages', description: 'Find', parameters: { type: 'object' } }],
            });
            await chat.complete({ messages: [
              { role: 'user', content: 'Who is Ada?' },
              { role: 'assistant', content: null, toolCalls: first.toolCalls, state: first.state },
              { role: 'tool', toolCallId: 'call_1', content: '{"name":"Ada Lovelace"}' },
            ] });
            return { first };
          } } }; } });`,
  });
  ({ kernel } = r);
  expect(r.refused).toEqual([]);
  await kernel.use(net, 'secrets').setSecret('openai', 'key', 'sk-test');
  const out = (await kernel
    .use(
      defineContract<{ run: () => Promise<Record<string, unknown>> }>({
        name: 'probe',
        version: 1,
      }),
    )
    .run()) as { first: unknown };

  expect(out.first).toMatchObject({
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

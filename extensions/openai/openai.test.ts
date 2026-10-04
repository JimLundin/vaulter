import { net } from '@contracts/net';
import { afterEach, expect, it, vi } from 'vitest';
import { defineContract } from '../../src/kernel/contract.ts';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(() => {
  kernel?.dispose();
  vi.unstubAllGlobals();
});

const sse = (events: object[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        // Split mid-event, as a network would.
        const text = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
        c.enqueue(enc.encode(text.slice(0, 50)));
        c.enqueue(enc.encode(text.slice(50)));
        c.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );

const RESPONSE = {
  model: 'gpt-6.1-sol',
  status: 'completed',
  output: [
    { type: 'reasoning', id: 'rs_1', encrypted_content: 'xyz', summary: [] },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'findEntity',
      arguments: '{"query":"Ada"}',
    },
  ],
  usage: { input_tokens: 12, output_tokens: 7 },
};

it('speaks the Responses and realtime APIs, with the key attached by the kernel', async () => {
  const seen: { url: string; auth: string | null; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const raw = init?.body;
    const body =
      typeof raw === 'string'
        ? JSON.parse(raw)
        : raw instanceof Uint8Array
          ? new TextDecoder().decode(raw)
          : raw;
    seen.push({ url, auth: new Headers(init?.headers).get('Authorization'), body });
    if (url.endsWith('/responses'))
      return (body as { stream: boolean }).stream
        ? sse([
            { type: 'response.output_text.delta', delta: 'Hel' },
            { type: 'response.output_text.delta', delta: 'lo' },
            {
              type: 'response.completed',
              response: {
                model: 'gpt-6.1-sol',
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }],
                usage: { input_tokens: 3, output_tokens: 1 },
              },
            },
          ])
        : Response.json(RESPONSE);
    if (url.endsWith('/realtime/client_secrets'))
      return Response.json({
        value: 'ek_1',
        expires_at: 1_900_000_000,
        session: { model: 'gpt-live-transcribe' },
      });
    return new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 400 });
  }) as typeof fetch;
  // The secrets extension makes the requests, attaching the key: the network is a fake here.
  vi.stubGlobal('fetch', fetchImpl);

  const r = await startRepo(['secrets', 'openai'], {
    'contracts/probe/index.ts': `import { defineContract } from '@vaulter/kernel';
        export const probe = defineContract<{ run(): Promise<unknown> }>({ name: 'probe', version: '1.0.0' });`,
    'extensions/probe/index.ts': `import { defineExtension } from '@vaulter/kernel';
        import { chat } from '@contracts/ai.chat';
        import { realtime } from '@contracts/ai.realtime';
        import { probe } from '@contracts/probe';
        export default defineExtension({ id: 'probe', version: '1.0.0', requires: { chat, realtime }, provides: { probe },
          setup({ chat, realtime }) { return { probe: { async run() {
            const first = await chat.complete({
              messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Who is Ada?' }],
              tools: [{ name: 'findEntity', description: 'Find', parameters: { type: 'object' } }],
              reasoning: 'low',
            });
            await chat.complete({ messages: [
              { role: 'user', content: 'Who is Ada?' },
              { role: 'assistant', content: null, toolCalls: first.toolCalls, state: first.state },
              { role: 'tool', toolCallId: 'call_1', content: '{"name":"Ada Lovelace"}' },
            ] });
            const deltas = [];
            const streamed = await chat.stream({ messages: [{ role: 'user', content: 'hi' }] }, (d) => { deltas.push(d.text); });
            const session = await realtime.session({ purpose: 'transcription', language: 'sv' });
            return { first, streamed, deltas, session };
          } } }; } });`,
  });
  kernel = r.kernel;
  expect(r.refused).toEqual([]);
  await kernel.use(net, 'secrets').setSecret('openai', 'key', 'sk-test');
  const out = (await kernel
    .use(
      defineContract<{ run: () => Promise<Record<string, unknown>> }>({
        name: 'probe',
        version: '1.0.0',
      }),
    )
    .run()) as Record<string, any>;

  expect(out.first).toMatchObject({
    content: null,
    toolCalls: [{ id: 'call_1', name: 'findEntity', arguments: '{"query":"Ada"}' }],
    stop: 'tool',
    usage: { input: 12, output: 7 },
  });
  expect(seen.every((s) => s.auth === 'Bearer sk-test')).toBe(true);
  const [first, second] = seen.map((s) => s.body as Record<string, any>);
  expect(first).toMatchObject({
    model: 'gpt-6.1-sol',
    store: false,
    include: ['reasoning.encrypted_content'],
    reasoning: { effort: 'low' },
    tools: [{ type: 'function', name: 'findEntity', strict: false }],
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
  expect(out.deltas).toEqual(['Hel', 'lo']);
  expect(out.streamed).toMatchObject({ content: 'Hello', stop: 'end' });
  expect(seen[3].body).toEqual({
    expires_after: { anchor: 'created_at', seconds: 600 },
    session: {
      type: 'transcription',
      audio: { input: { transcription: { model: 'gpt-live-transcribe', languages: ['sv'] } } },
    },
  });
  expect(out.session).toEqual({
    clientSecret: 'ek_1',
    expiresAt: new Date(1_900_000_000_000).toISOString(),
    model: 'gpt-live-transcribe',
    connect: { kind: 'webrtc', url: 'https://api.openai.com/v1/realtime/calls' },
  });
});

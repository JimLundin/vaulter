import { afterEach, expect, it } from 'vitest';
import { defineContract } from '../../src/kernel/contract.ts';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { secretStore } from '../../src/kernel/secrets.ts';
import { memoryKeep, startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(() => kernel?.dispose());

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

it('speaks the Responses, transcription, realtime and embeddings APIs, with the key attached by the kernel', async () => {
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
    if (url.endsWith('/audio/transcriptions')) return Response.json({ text: 'Lunch with Ada' });
    if (url.endsWith('/realtime/client_secrets'))
      return Response.json({
        value: 'ek_1',
        expires_at: 1_900_000_000,
        session: { model: 'gpt-live-transcribe' },
      });
    if (url.endsWith('/embeddings'))
      return Response.json({
        model: 'text-embedding-3-small',
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      });
    return new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 400 });
  }) as typeof fetch;
  const secrets = secretStore(memoryKeep());
  await secrets.set('openai', 'key', 'sk-test');

  const r = await startRepo(
    ['openai'],
    {
      'contracts/probe/index.ts': `import { defineContract } from '@pip/kernel';
        export const probe = defineContract<{ run(): Promise<unknown> }>({ name: 'probe', version: '1.0.0' });`,
      'extensions/probe/index.ts': `import { defineExtension } from '@pip/kernel';
        import { chat } from '@contracts/ai.chat';
        import { transcribe } from '@contracts/ai.transcribe';
        import { realtime } from '@contracts/ai.realtime';
        import { embed } from '@contracts/ai.embed';
        import { probe } from '@contracts/probe';
        export default defineExtension({ id: 'probe', version: '1.0.0', requires: { chat, transcribe, realtime, embed }, provides: { probe },
          setup({ chat, transcribe, realtime, embed }) { return { probe: { async run() {
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
            const text = await transcribe.transcribe({ audio: new Blob(['RIFF']), mime: 'audio/webm', language: 'sv' });
            const session = await realtime.session({ purpose: 'transcription', language: 'sv' });
            const vectors = await embed.embed({ texts: ['a', 'b'] });
            return { first, streamed, deltas, text, session, vectors };
          } } }; } });`,
    },
    { secrets, fetch: fetchImpl },
  );
  kernel = r.kernel;
  expect(r.refused).toEqual([]);
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
  expect(out.text).toMatchObject({ text: 'Lunch with Ada' });
  const multipart = seen[3].body as string;
  expect(multipart).toMatch(/name="model"\r\n\r\ngpt-transcribe/);
  expect(multipart).toMatch(/filename="audio.webm"\r\nContent-Type: audio\/webm\r\n\r\nRIFF/);
  expect(seen[4].body).toEqual({
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
  expect(out.vectors).toEqual({
    vectors: [
      [1, 0],
      [0, 1],
    ],
    model: 'text-embedding-3-small',
    dimensions: 2,
  });
});

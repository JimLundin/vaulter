import { expect, test, vi } from 'vitest';
import { generateText } from 'ai';
import { createOpenAICapabilities } from './index.ts';
import { openAIEmbeddings } from './embeddings.ts';
import { openAIFileTranscription } from './file-transcription.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request } from '../../vault/nodes/fixtures.test-support.ts';
import { prepareAgentRun, readAgentRun } from '../store.ts';

function completion(text: string) {
  return {
    id: 'resp-fixture',
    object: 'response',
    created_at: 1,
    model: 'fixture-llm',
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'message-1',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 3,
      output_tokens: 2,
      total_tokens: 5,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}
function streamed(text: string) {
  const response = completion(text);
  const events = [
    { type: 'response.created', response },
    { type: 'response.output_item.added', output_index: 0, item: response.output[0] },
    {
      type: 'response.output_text.delta',
      item_id: 'message-1',
      output_index: 0,
      content_index: 0,
      delta: text,
    },
    {
      type: 'response.output_text.done',
      item_id: 'message-1',
      output_index: 0,
      content_index: 0,
      text,
    },
    { type: 'response.output_item.done', output_index: 0, item: response.output[0] },
    { type: 'response.completed', response },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

test('uses the actual Responses SDK with configured model and disables response storage', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json(completion('Hello')));
  const capabilities = createOpenAICapabilities({
    apiKey: 'fixture-secret',
    models: { llm: 'fixture-llm' },
    fetch,
  });
  const model = await capabilities.model();
  const result = await generateText({ model, prompt: 'Hello' });
  expect(result.text).toBe('Hello');
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(JSON.parse(init!.body as string)).toMatchObject({ model: 'fixture-llm', store: false });
  expect(new Headers(init!.headers).get('authorization')).toBe('Bearer fixture-secret');
});

test('streams OpenAI into an independent accepted Agent run and records served model and usage', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [create('user', { kind: 'actor' }), create('agent', { kind: 'agent' })]),
  );
  const prepared = await prepareAgentRun(nodes, {
    id: 'send',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-10T12:00:00Z',
    provider: 'openai',
    model: 'fixture-llm',
    settings: {},
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Hello',
        },
      },
    ],
  });
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
    expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('running');
    return streamed('A streamed answer');
  });
  const capabilities = createOpenAICapabilities({ apiKey: 'fixture-secret', fetch });
  const backend = capabilities.agent({ nodes });
  expect((await backend.start(prepared).done).phase).toBe('complete');
  expect((await readAgentRun(nodes, 'run'))?.data).toMatchObject({
    model: { requested: 'fixture-llm', served: 'fixture-llm' },
    usage: { input: 3, output: 2 },
    output: { text: 'A streamed answer' },
  });
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).store).toBe(false);
  expect(JSON.stringify(await nodes.changes('send'))).not.toContain('fixture-secret');
  backend.dispose();
});

function embedding(data: { index: number; embedding: number[] }[], model = 'embedding-fixture') {
  return Response.json({ model, data, usage: { prompt_tokens: 2, total_tokens: 2 } });
}

test('embedding batches preserve input ordering, configured dimensions, and usage', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => {
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      model: 'embedding-fixture',
      dimensions: 2,
      encoding_format: 'float',
    });
    const values = body.input as string[];
    return Promise.resolve(
      embedding(values.map((text, index) => ({ index, embedding: [Number(text), 1] })).reverse()),
    );
  });
  const embed = openAIEmbeddings({
    apiKey: 'fixture',
    model: 'embedding-fixture',
    dimensions: 2,
    fetch,
  });
  const result = await embed(Array.from({ length: 130 }, (_, index) => String(index)));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.vectors.map((vector) => vector[0])).toEqual(
    Array.from({ length: 130 }, (_, index) => index),
  );
  expect(result).toMatchObject({ dimensions: 2, tokens: 4, model: 'embedding-fixture' });
  expect(Object.isFrozen(result.vectors[0])).toBe(true);
});

test.each([
  {
    data: [
      { index: 0, embedding: [1, 2] },
      { index: 0, embedding: [3, 4] },
    ],
  },
  {
    data: [
      { index: 0, embedding: [1] },
      { index: 1, embedding: [3, 4] },
    ],
  },
  {
    data: [
      { index: 0, embedding: [1, 2] },
      { index: 2, embedding: [3, 4] },
    ],
  },
  { data: [{ index: 0, embedding: [1, 2] }] },
])('rejects invalid embedding indices, counts, or dimensions ($data)', async ({ data }) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(embedding(data));
  await expect(
    openAIEmbeddings({ apiKey: 'fixture', dimensions: 2, fetch })(['one', 'two']),
  ).rejects.toThrow();
});

test('rejects nonfinite embeddings, blank input, and cancellation before a later batch', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      new Response(
        '{"model":"fixture","data":[{"index":0,"embedding":[1e999]}],"usage":{"prompt_tokens":1,"total_tokens":1}}',
      ),
    );
  const embed = openAIEmbeddings({ apiKey: 'fixture', model: 'custom', fetch });
  await expect(embed(['text'])).rejects.toThrow();
  await expect(embed([' '])).rejects.toThrow('nonempty');
  const abort = new AbortController();
  fetch.mockImplementation((_url, init) => {
    const body = JSON.parse(init!.body as string);
    abort.abort();
    return Promise.resolve(
      embedding((body.input as string[]).map((_text, index) => ({ index, embedding: [1] }))),
    );
  });
  fetch.mockClear();
  await expect(
    embed(
      Array.from({ length: 129 }, () => 'text'),
      abort.signal,
    ),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledOnce();
});

test('file transcription sends multipart audio and validates size, cancellation, and redacted upstream failures', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json({ text: 'Stored words' }));
  const transcribe = openAIFileTranscription({
    apiKey: 'fixture',
    model: 'transcription-fixture',
    fetch,
  });
  const file = new File(['recording'], 'memo.webm', { type: 'audio/webm' });
  expect(await transcribe(file)).toEqual({
    text: 'Stored words',
    model: 'transcription-fixture',
    provider: 'openai',
  });
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
  expect(init!.body).toBeInstanceOf(FormData);
  const form = init!.body as FormData;
  expect(form.get('model')).toBe('transcription-fixture');
  expect((form.get('file') as File).name).toBe('memo.webm');
  expect(new Headers(init!.headers).has('content-type')).toBe(false);
  await expect(transcribe(new File([], 'empty.wav'))).rejects.toThrow('25 MB');
  await expect(
    transcribe(new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.wav')),
  ).rejects.toThrow('25 MB');
  await expect(transcribe(file, AbortSignal.abort())).rejects.toThrow();
  expect(fetch).toHaveBeenCalledOnce();
  fetch.mockResolvedValue(new Response('private upstream payload', { status: 401 }));
  await expect(transcribe(file)).rejects.toThrow(
    'OpenAI audio/transcriptions request failed (401)',
  );
});

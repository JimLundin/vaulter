import { generateText } from 'ai';
import { expect, test, vi } from 'vitest';
import { readAgentRun, startAgentRun } from '@/modules/agent/operations.ts';
import { agentSchema } from '@/modules/agent/records.ts';
import { createMemoryStorage, openDatabase } from '@/core/store/index.ts';
import { openAIFileTranscription } from './file-transcription.ts';
import { createOpenAICapabilities } from './index.ts';

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
  await using db = await openDatabase({ schema: agentSchema, storage: createMemoryStorage() });
  const { run } = await db.transaction(async (tx) => {
    const actor = await tx.entities.actors.insert({ kind: 'agent', name: 'Assistant' });
    const agent = await tx.entities.agents.insert({
      actor,
      provider: 'openai',
      model: 'fixture-llm',
      instructions: '',
      settings: {},
      tools: [],
    });
    return await startAgentRun(tx, {
      agent,
      startedAt: new Date(),
      inputs: [{ role: 'user', transformation: 'verbatim', content: 'Hello' }],
    });
  });
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
    expect((await readAgentRun(db, run))?.status).toBe('running');
    return streamed('A streamed answer');
  });
  const capabilities = createOpenAICapabilities({ apiKey: 'fixture-secret', fetch });
  const backend = capabilities.agent({ db, run });
  expect((await backend.done).phase).toBe('complete');
  expect(await readAgentRun(db, run)).toMatchObject({
    requestedModel: 'fixture-llm',
    servedModel: 'fixture-llm',
    inputTokens: 3,
    outputTokens: 2,
    output: { text: 'A streamed answer' },
  });
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).store).toBe(false);
  expect(
    JSON.stringify(
      await db.entities.modelSteps.query({
        select: { input: true, configuration: true, response: true },
      }),
    ),
  ).not.toContain('fixture-secret');
  backend.dispose();
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

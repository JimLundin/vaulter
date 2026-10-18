// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { readAgentRun } from '@/modules/agent/operations.ts';
import { voiceFixture } from '@/modules/agent/voice-fixture.test-support.ts';
import { createOpenAICapabilities } from './index.ts';
import { call, creates, done, media, outputs, response, speech } from './media.test-support.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup() {
  const harness = media();
  const abort = new AbortController();
  const fixture = await voiceFixture();
  const events = { transcript: vi.fn(), audio: vi.fn(), error: vi.fn() };
  const capabilities = createOpenAICapabilities({
    apiKey: 'fictional-secret',
    fetch: harness.fetch,
  });
  await fixture.db.transaction((tx) =>
    tx.entities.agents.update({
      ...fixture.agent,
      provider: 'openai',
      model: capabilities.models.voice,
    }),
  );
  const voice = await capabilities.voiceAgent({
    db: fixture.db,
    user: fixture.user,
    agent: fixture.agent,
    instructions: 'Capture paragraphs.',
    tools: fixture.tools,
    events,
    signal: abort.signal,
  });
  return { ...harness, ...fixture, events, voice, abort };
}
test('actual voice protocol accepts Agent context before response and durable direct tools before continuation', async () => {
  const { channel, db, voice, fetch, track } = await setup();
  const { session } = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
  expect(session.audio.input.turn_detection).toMatchObject({
    create_response: false,
    interrupt_response: false,
  });
  expect(session.tools.map(({ name }: { name: string }) => name)).toEqual(['captureParagraph']);
  speech(channel);
  await vi.waitFor(() => expect(creates(channel)).toBe(1));
  const run = voice.snapshot().run!;
  expect((await readAgentRun(db, run))?.inputs[0]?.content).toBe(session.instructions);
  response(channel);
  done(channel, [call('captureParagraph', { text: 'hello' })]);
  await vi.waitFor(() => expect(creates(channel)).toBe(2));
  expect((await readAgentRun(db, run))?.executions[0]).toMatchObject({
    status: 'complete',
    input: { text: 'note:hello' },
  });
  expect(outputs(channel).at(-1)?.item).toMatchObject({
    type: 'function_call_output',
    call_id: 'call-1',
  });
  response(channel, 'final');
  channel.event({
    type: 'response.output_audio_transcript.done',
    item_id: 'answer',
    response_id: 'final',
    transcript: 'Captured.',
  });
  done(channel, [], 'completed', 'final');
  await vi.waitFor(() => expect(voice.snapshot().execution?.phase).toBe('complete'));
  expect((await readAgentRun(db, run))?.output).toMatchObject({ text: 'Captured.' });
  await voice.close();
  await db[Symbol.asyncDispose]();
  expect(track.stop).toHaveBeenCalled();
});

test('final transcripts follow committed audio order and interrupted old responses cannot invoke tools', async () => {
  const { channel, db, voice } = await setup();
  for (const item of ['one', 'two']) {
    channel.event({ type: 'input_audio_buffer.speech_started' });
    channel.event({ type: 'input_audio_buffer.speech_stopped' });
    channel.event({ type: 'input_audio_buffer.committed', item_id: item });
  }
  channel.event({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'two',
    transcript: 'Second thought',
  });
  expect(creates(channel)).toBe(0);
  channel.event({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'one',
    transcript: 'First thought',
  });
  await vi.waitFor(() => expect(creates(channel)).toBe(1));
  const users = await db.entities.contextInputs.query({
    where: { role: { eq: 'user' } },
    select: { content: true },
  });
  expect(users.map(({ content }) => content).sort()).toEqual([
    'First thought',
    'First thought',
    'Second thought',
  ]);
  const current = await readAgentRun(db, voice.snapshot().run!);
  expect(
    current?.inputs.filter((input) => input.role === 'user').map((input) => input.content),
  ).toEqual(['First thought', 'Second thought']);
  response(channel);
  speech(channel, 'three', 'Leave it alone');
  done(channel, [call('captureParagraph', { text: 'Wrong' })]);
  await vi.waitFor(() => expect(creates(channel)).toBe(2));
  expect(await db.entities.notes.query({ select: {} })).toEqual([]);
  expect(channel.sent).toContainEqual({ type: 'response.cancel' });
  await voice.close();
  await db[Symbol.asyncDispose]();
});
test.each(['cancelled', 'incomplete'])(
  'a %s voice response cannot trigger supplied tools',
  async (status) => {
    const { channel, db, voice } = await setup();
    speech(channel);
    await vi.waitFor(() => expect(creates(channel)).toBe(1));
    response(channel);
    done(channel, [call('captureParagraph', { text: 'Wrong' })], status);
    await vi.waitFor(() =>
      expect(voice.snapshot().execution?.data.status).toBe(
        status === 'cancelled' ? 'stopped' : 'failed',
      ),
    );
    expect(await db.entities.notes.query({ select: {} })).toEqual([]);
    await voice.close();
    await db[Symbol.asyncDispose]();
  },
);

test('microphone cancellation stops late tracks before any endpoint call', async () => {
  const { microphone, track, fetch } = media();
  let allow!: () => void;
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve) => {
          allow = () => resolve(microphone);
        }),
    },
  });
  const abort = new AbortController();
  const opening = createOpenAICapabilities({ apiKey: 'fixture', fetch }).liveVoice({
    instructions: 'Help.',
    events: { audio: vi.fn(), error: vi.fn(), transcript: vi.fn() },
    signal: abort.signal,
    tools: {},
    history: [],
    acceptUser: vi.fn(),
    execute: vi.fn(),
    recordResponse: vi.fn(),
    expire: vi.fn(),
  });
  const expectation = expect(opening).rejects.toThrow();
  await vi.waitFor(() => expect(allow).toBeTypeOf('function'));
  abort.abort();
  allow();
  await expectation;
  expect(track.stop).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('partial and final transcripts retain text and buffered playback interruption preserves accepted history', async () => {
  const { channel, voice, db } = await setup();
  speech(channel);
  await vi.waitFor(() => expect(creates(channel)).toBe(1));
  const firstRun = voice.snapshot().run!;
  response(channel);
  channel.event({
    type: 'response.output_audio_transcript.delta',
    response_id: 'response-1',
    item_id: 'answer',
    delta: 'Which',
  });
  channel.event({
    type: 'response.output_audio_transcript.done',
    response_id: 'response-1',
    item_id: 'answer',
    transcript: 'Which paragraph?',
  });
  channel.event({ type: 'output_audio_buffer.started' });
  done(channel);
  await vi.waitFor(() => expect(voice.snapshot().execution?.data.status).toBe('complete'));
  speech(channel, 'second', 'The last one');
  await vi.waitFor(() => expect(creates(channel)).toBe(2));
  expect(channel.sent).toContainEqual({ type: 'output_audio_buffer.clear' });
  expect((await readAgentRun(db, firstRun))?.output).toMatchObject({ text: 'Which paragraph?' });
  await voice.close();
  await db[Symbol.asyncDispose]();
});

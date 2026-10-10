// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { createOpenAICapabilities } from './index.ts';
import { media, speech, response, done, call, creates, outputs } from './media.test-support.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request } from '../../vault/nodes/fixtures.test-support.ts';
import { paragraphTools } from '../tool-fixture.test-support.ts';
import { readAgentRun } from '../store.ts';
import type { NodeCommit, NodeStore } from '../../vault/nodes/store.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(transform: (nodes: NodeStore) => NodeStore = (nodes) => nodes) {
  const harness = media();
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [create('user', { kind: 'actor' }), create('agent', { kind: 'agent' })]),
  );
  const events = { transcript: vi.fn(), audio: vi.fn(), error: vi.fn() };
  const capabilities = createOpenAICapabilities({
    apiKey: 'fictional-secret',
    fetch: harness.fetch,
  });
  const voice = await capabilities.voiceAgent({
    nodes: transform(nodes),
    user: 'user',
    agent: 'agent',
    instructions: 'Capture paragraphs.',
    tools: paragraphTools,
    writableKinds: ['paragraph'],
    events,
    signal: new AbortController().signal,
  });
  return { ...harness, nodes, events, voice };
}
test('actual voice protocol accepts Agent context before response and durable direct tools before continuation', async () => {
  const { channel, nodes, voice, fetch, track } = await setup();
  const { session } = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
  expect(session.audio.input.turn_detection).toMatchObject({
    create_response: false,
    interrupt_response: false,
  });
  expect(session.tools.map(({ name }: { name: string }) => name)).toEqual(['captureParagraph']);
  speech(channel);
  await vi.waitFor(() => expect(creates(channel)).toBe(1));
  const run = voice.snapshot().run!;
  expect((await readAgentRun(nodes, run))?.context[0]?.data.content).toBe(session.instructions);
  response(channel);
  done(channel, [call('captureParagraph', { text: 'hello' })]);
  await vi.waitFor(() => expect(creates(channel)).toBe(2));
  expect((await readAgentRun(nodes, run))?.tools[0]?.data).toMatchObject({
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
  expect((await readAgentRun(nodes, run))?.data.output).toMatchObject({ text: 'Captured.' });
  await voice.close();
  expect(track.stop).toHaveBeenCalled();
});

test.each(['recover', 'close'])(
  'outcome-save pause holds protocol continuation and %s never reexecutes the tool',
  async (action) => {
    let offline = true;
    const saves: NodeCommit[] = [];
    const { channel, nodes, voice, events } = await setup((store) => ({
      ...store,
      commit: async (value) => {
        if (value.kind.action === 'completeTool') {
          saves.push(value);
          // biome-ignore lint/suspicious/noUnnecessaryConditions: recovery changes this transport flag.
          if (offline) throw new Error('Outcome offline');
        }
        return await store.commit(value);
      },
    }));
    speech(channel);
    await vi.waitFor(() => expect(creates(channel)).toBe(1));
    const run = voice.snapshot().run!;
    response(channel);
    done(channel, [call('captureParagraph', { text: 'hello' })]);
    await vi.waitFor(() => expect(voice.snapshot().phase).toBe('paused'));
    expect(creates(channel)).toBe(1);
    expect(outputs(channel)).toHaveLength(0);
    expect(
      (await nodes.history()).filter(({ kind }) => kind.scope === 'paragraphFixture'),
    ).toHaveLength(1);
    expect((await readAgentRun(nodes, run))?.tools[0]?.effects).toBe('uncertain');
    expect(events.error).not.toHaveBeenCalled();
    if (action === 'close') await voice.close();
    offline = false;
    await voice.retrySave();
    expect(saves[1]).toEqual(saves[0]);
    expect(
      (await nodes.history()).filter(({ kind }) => kind.scope === 'paragraphFixture'),
    ).toHaveLength(1);
    expect((await readAgentRun(nodes, run))?.tools[0]?.data.status).toBe('complete');
    if (action === 'recover') {
      await vi.waitFor(() => expect(creates(channel)).toBe(2));
      expect(outputs(channel)).toHaveLength(1);
    } else {
      expect(creates(channel)).toBe(1);
      expect(outputs(channel)).toHaveLength(0);
    }
    await voice.close();
  },
);

test('final transcripts follow committed audio order and interrupted old responses cannot invoke tools', async () => {
  const { channel, nodes, voice } = await setup();
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
  const accepted = (await nodes.history())
    .filter(({ kind }) => kind.action === 'startRun')
    .reverse();
  const inputs: unknown[] = [];
  for (const transaction of accepted) {
    // biome-ignore lint/performance/noAwaitInLoops: reconstruct accepted speech in definitive sequence order.
    const changes = await nodes.changes(transaction.id);
    inputs.push(
      changes
        .filter(({ after }) => after.data?.kind === 'contextInput' && after.data.role === 'user')
        .at(-1)?.after.data?.content,
    );
  }
  expect(inputs).toEqual(['First thought', 'Second thought']);
  response(channel);
  speech(channel, 'three', 'Leave it alone');
  done(channel, [call('captureParagraph', { text: 'Wrong' })]);
  await vi.waitFor(() => expect(creates(channel)).toBe(2));
  expect((await nodes.history()).some(({ kind }) => kind.scope === 'paragraphFixture')).toBe(false);
  expect(channel.sent).toContainEqual({ type: 'response.cancel' });
  await voice.close();
});

test.each(['cancelled', 'incomplete'])(
  'a %s voice response cannot trigger supplied tools',
  async (status) => {
    const { channel, nodes, voice } = await setup();
    speech(channel);
    await vi.waitFor(() => expect(creates(channel)).toBe(1));
    response(channel);
    done(channel, [call('captureParagraph', { text: 'Wrong' })], status);
    await vi.waitFor(() =>
      expect(voice.snapshot().execution?.data.status).toBe(
        status === 'cancelled' ? 'stopped' : 'failed',
      ),
    );
    expect((await nodes.history()).some(({ kind }) => kind.scope === 'paragraphFixture')).toBe(
      false,
    );
    await voice.close();
  },
);

test('Close settles an already-started content acceptance and retains its successful outcome', async () => {
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { channel, nodes, voice } = await setup((store) => ({
    ...store,
    commit: async (value) => {
      if (value.kind.scope === 'paragraphFixture') {
        started();
        await held;
      }
      return await store.commit(value);
    },
  }));
  speech(channel);
  await vi.waitFor(() => expect(creates(channel)).toBe(1));
  response(channel);
  done(channel, [call('captureParagraph', { text: 'Keep it' })]);
  await entered;
  const closing = voice.close();
  release();
  await closing;
  const run = voice.snapshot().run!;
  expect(
    (await nodes.history()).filter(({ kind }) => kind.scope === 'paragraphFixture'),
  ).toHaveLength(1);
  expect((await readAgentRun(nodes, run))?.tools[0]?.data.status).toBe('complete');
  expect((await readAgentRun(nodes, run))?.data.status).toBe('stopped');
  expect(outputs(channel)).toHaveLength(0);
});

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

test('Close drains finalized speech received while initial acceptance is held', async () => {
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let initial = true;
  const { channel, nodes, voice } = await setup((store) => ({
    ...store,
    commit: async (value) => {
      if (initial) {
        initial = false;
        started();
        await held;
      }
      return await store.commit(value);
    },
  }));
  speech(channel, 'one', 'First thought');
  await entered;
  speech(channel, 'two', 'Second thought');
  const closing = voice.close();
  release();
  await closing;
  expect((await nodes.history()).filter(({ kind }) => kind.action === 'startRun')).toHaveLength(2);
  expect(creates(channel)).toBe(0);
});

test('invocation persistence failure prevents execution and recovery preserves uncertainty without protocol continuation', async () => {
  let offline = true;
  const saves: NodeCommit[] = [];
  const { channel, nodes, voice } = await setup((store) => ({
    ...store,
    commit: async (value) => {
      if (value.kind.action === 'recordTool') {
        saves.push(value);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: recovery changes this transport flag.
        if (offline) throw new Error('Invocation offline');
      }
      return await store.commit(value);
    },
  }));
  speech(channel);
  await vi.waitFor(() => expect(creates(channel)).toBe(1));
  response(channel);
  done(channel, [call('captureParagraph', { text: 'Never execute' })]);
  await vi.waitFor(() => expect(voice.snapshot().execution?.persistenceStage).toBe('invocation'));
  expect((await nodes.history()).some(({ kind }) => kind.scope === 'paragraphFixture')).toBe(false);
  offline = false;
  await voice.retrySave();
  await vi.waitFor(() => expect(voice.snapshot().execution?.data.status).toBe('interrupted'));
  expect(saves[1]).toEqual(saves[0]);
  expect((await nodes.history()).some(({ kind }) => kind.scope === 'paragraphFixture')).toBe(false);
  expect((await readAgentRun(nodes, voice.snapshot().run!))?.tools[0]?.effects).toBe('uncertain');
  expect(outputs(channel)).toHaveLength(0);
  expect(creates(channel)).toBe(1);
  await voice.close();
});

test('partial and final transcripts retain text and buffered playback interruption preserves accepted history', async () => {
  const { channel, voice, nodes } = await setup();
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
  expect((await readAgentRun(nodes, firstRun))?.data.output?.text).toBe('Which paragraph?');
  await voice.close();
});

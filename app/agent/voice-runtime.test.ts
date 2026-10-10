import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request } from '../vault/nodes/fixtures.test-support.ts';
import { paragraphTools } from './tool-fixture.test-support.ts';
import { readAgentRun } from './store.ts';
import { prepareAgentRun } from './store.ts';
import { createAgentBackend } from './runtime.ts';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createVoiceAgent } from './voice-runtime.ts';
import type { LiveVoiceOptions, VoiceHistory, VoicePart } from './voice.ts';
import { tool } from 'ai';
import { z } from 'zod';
import type { NodeStore, NodeCommit } from '../vault/nodes/store.ts';
import type { VoiceAgentOptions } from './voice-runtime.ts';

async function fixture(transform: (nodes: NodeStore) => NodeStore = (nodes) => nodes) {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [create('user', { kind: 'actor' }), create('agent', { kind: 'agent' })]),
  );
  let callbacks!: LiveVoiceOptions<VoiceHistory, VoicePart>;
  const options: VoiceAgentOptions = {
    nodes: transform(nodes),
    user: 'user',
    agent: 'agent',
    instructions: 'Capture paragraphs.',
    writableKinds: ['paragraph'],
    tools: paragraphTools,
    provider: 'fictional',
    model: 'voice-model',
    transcriptionModel: 'transcription-model',
    events: { transcript: vi.fn(), audio: vi.fn(), error: vi.fn() },
    signal: new AbortController().signal,
    connect: (value) => {
      callbacks = value;
      return Promise.resolve({ mute: vi.fn(), interrupt: value.expire, close: vi.fn() });
    },
  };
  return { nodes, options, callbacks: () => callbacks };
}

test('failed tool outcomes pause until durable acceptance without fabricated success or repeated effects', async () => {
  let offline = true;
  let effects = 0;
  const saves: NodeCommit[] = [];
  const {
    nodes,
    options,
    callbacks: get,
  } = await fixture((store) => ({
    ...store,
    commit: async (value) => {
      if (value.kind.action === 'completeTool') {
        saves.push(value);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: recovery changes this transport flag.
        if (offline) throw new Error('Offline');
      }
      return await store.commit(value);
    },
  }));
  const voice = await createVoiceAgent({
    ...options,
    tools: () => ({
      fail: tool({
        inputSchema: z.object({}),
        execute: (): string => {
          effects++;
          throw new Error('Domain operation failed');
        },
      }),
    }),
  });
  const callbacks = get();
  const at = '2026-10-10T12:00:00Z';
  await callbacks.acceptUser('speech', 'Try this.', { started: at, ended: at });
  const result = callbacks.execute({ callId: 'fail', name: 'fail', input: {} }, callbacks.signal);
  const expectation = expect(result).rejects.toThrow('Domain operation failed');
  await vi.waitFor(() => expect(voice.snapshot().phase).toBe('paused'));
  expect(voice.snapshot().execution?.pendingTool?.execution.status).toBe('failed');
  offline = false;
  await voice.retrySave();
  await expectation;
  expect(effects).toBe(1);
  expect(saves[1]).toEqual(saves[0]);
  expect((await readAgentRun(nodes, voice.snapshot().run!))?.tools[0]?.data.status).toBe('failed');
  await voice.close();
});

test('declaration-only setup and each accepted turn receive separate guarded contexts', async () => {
  const { options, callbacks: get } = await fixture();
  const contexts: import('./tools.ts').AgentToolContext[] = [];
  const voice = await createVoiceAgent({
    ...options,
    tools: (context) => {
      contexts.push(context);
      return paragraphTools(context);
    },
  });
  expect(contexts[0]?.signal.aborted).toBe(true);
  expect(() => contexts[0]!.snapshot()).toThrow('declarations cannot read');
  const at = '2026-10-10T12:00:00Z';
  await get().acceptUser('first', 'First.', { started: at, ended: at });
  await get().recordResponse('first', [{ kind: 'text', text: 'Answer.' }], 'complete');
  await get().acceptUser('second', 'Second.', { started: at, ended: at });
  expect(contexts).toHaveLength(3);
  expect(() => contexts[1]!.snapshot()).toThrow('stopped');
  expect(contexts[2]!.signal.aborted).toBe(false);
  await voice.close();
  expect(contexts[2]!.signal.aborted).toBe(true);
});

test('changed or approval-requiring tool declarations cannot begin executable voice effects', async () => {
  const { options, callbacks: get } = await fixture();
  const voice = await createVoiceAgent({
    ...options,
    tools: (context) => (context.signal.aborted ? paragraphTools(context) : {}),
  });
  const at = '2026-10-10T12:00:00Z';
  await expect(get().acceptUser('speech', 'First.', { started: at, ended: at })).rejects.toThrow(
    'must remain stable',
  );
  await voice.close();
  const connect = vi.fn(options.connect);
  await expect(
    createVoiceAgent({
      ...options,
      connect,
      tools: async (context) => {
        const supplied = await paragraphTools(context);
        return { captureParagraph: { ...supplied.captureParagraph, needsApproval: true } };
      },
    }),
  ).rejects.toThrow('no approval requirement');
  expect(connect).not.toHaveBeenCalled();
});

test('an unrelated text run progresses while a voice module effect is held', async () => {
  const { nodes, options, callbacks: get } = await fixture();
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const voice = await createVoiceAgent({
    ...options,
    tools: (context) => ({
      held: tool({
        inputSchema: z.object({}),
        execute: async () => {
          started();
          await held;
          return await context.commit({
            id: 'voice-content',
            kind: { scope: 'paragraphFixture', action: 'capture' },
            message: null,
            changes: [create('voice-paragraph', { kind: 'paragraph', text: 'Voice' })],
          });
        },
      }),
    }),
  });
  const at = '2026-10-10T12:00:00Z';
  await get().acceptUser('voice', 'Voice.', { started: at, ended: at });
  const effect = get().execute({ callId: 'voice-call', name: 'held', input: {} }, get().signal);
  await entered;
  const prepared = await prepareAgentRun(nodes, {
    id: 'text-start',
    run: 'text-run',
    agent: 'agent',
    recordedBy: 'user',
    at,
    provider: 'fictional',
    model: 'text',
    settings: {},
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Text.',
        },
      },
    ],
  });
  const text = createAgentBackend({
    nodes,
    model: () =>
      Promise.resolve(
        new MockLanguageModelV4({
          doStream: () =>
            Promise.resolve({
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: undefined },
                  usage: {
                    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 0, text: 0, reasoning: 0 },
                  },
                },
              ]),
            }),
        }),
      ),
  }).start(prepared);
  try {
    expect((await text.done).phase).toBe('complete');
    expect((await nodes.snapshot()).get('voice-paragraph')).toBeUndefined();
  } finally {
    release();
    await effect;
  }
  expect((await nodes.snapshot()).get('voice-paragraph')?.data?.text).toBe('Voice');
  await voice.close();
});

test('caller callbacks compose their initial records and project transcripts outside Agent', async () => {
  const { nodes, options, callbacks: get } = await fixture();
  const onResponse = vi.fn(() => Promise.resolve());
  const voice = await createVoiceAgent({
    ...options,
    onResponse,
    prepareTurn: async (input) => {
      const prepared = await prepareAgentRun(nodes, {
        id: 'caller-start',
        run: 'caller-run',
        agent: 'agent',
        recordedBy: 'user',
        at: input.timing.ended,
        provider: input.provider,
        model: input.model,
        settings: {},
        context: input.context,
        enabledTools: input.enabledTools,
      });
      return {
        ...prepared,
        commit: {
          ...prepared.commit,
          origin: 'caller-context',
          changes: [
            create('caller-context', { kind: 'fictionalOrigin', text: input.text }),
            ...prepared.commit.changes,
          ],
        },
      };
    },
  });
  const at = '2026-10-10T12:00:00Z';
  await get().acceptUser('speech', 'Compose this.', { started: at, ended: at });
  expect((await nodes.changes('caller-start')).map(({ node }) => node)).toContain('caller-context');
  await get().recordResponse('speech', [{ kind: 'text', text: 'Composed.' }], 'complete');
  expect(onResponse).toHaveBeenCalledWith(
    'speech',
    [{ kind: 'text', text: 'Composed.' }],
    expect.objectContaining({ phase: 'complete' }),
    'complete',
    expect.any(String),
  );
  await voice.close();
});

test('caller transcript save recovery retries the same projection without repeating Agent effects', async () => {
  const { nodes, options, callbacks: get } = await fixture();
  let offline = true;
  const projections: unknown[] = [];
  const voice = await createVoiceAgent({
    ...options,
    onResponse: (_item, parts, _state, status, id) => {
      if (status === 'complete') {
        projections.push({ parts, id });
        // biome-ignore lint/suspicious/noUnnecessaryConditions: recovery changes this transport flag.
        if (offline) return Promise.reject(new Error('Transcript offline'));
      }
      return Promise.resolve();
    },
  });
  const at = '2026-10-10T12:00:00Z';
  await get().acceptUser('speech', 'Capture.', { started: at, ended: at });
  await get().execute(
    { callId: 'capture', name: 'captureParagraph', input: { text: 'hello' } },
    get().signal,
  );
  await expect(
    get().recordResponse('speech', [{ kind: 'text', text: 'Captured.' }], 'complete'),
  ).rejects.toThrow('Transcript offline');
  expect(voice.snapshot().phase).toBe('unsaved');
  offline = false;
  await voice.retrySave();
  expect(projections[1]).toEqual(projections[0]);
  expect(
    (await nodes.history()).filter(({ kind }) => kind.scope === 'paragraphFixture'),
  ).toHaveLength(1);
  await voice.close();
});

test('closing after a terminal Agent save failure retains persistence-only recovery', async () => {
  let offline = true;
  const {
    nodes,
    options,
    callbacks: get,
  } = await fixture((store) => ({
    ...store,
    commit: async (value) => {
      if (value.kind.action === 'completeRun' && offline) throw new Error('Terminal offline');
      return await store.commit(value);
    },
  }));
  const voice = await createVoiceAgent(options);
  const at = '2026-10-10T12:00:00Z';
  await get().acceptUser('speech', 'Capture.', { started: at, ended: at });
  await get().recordResponse('speech', [{ kind: 'text', text: 'Completed.' }], 'complete');
  expect(voice.snapshot().phase).toBe('unsaved');
  const run = voice.snapshot().run!;
  await voice.close();
  offline = false;
  await voice.retrySave();
  expect((await readAgentRun(nodes, run))?.data.status).toBe('complete');
});

test('a fictional voice caller retains independent Agent context, invocation, outcome and content', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [create('user', { kind: 'actor' }), create('agent', { kind: 'agent' })]),
  );
  let callbacks!: LiveVoiceOptions<VoiceHistory, VoicePart>;
  const voice = await createVoiceAgent({
    nodes,
    user: 'user',
    agent: 'agent',
    instructions: 'Capture paragraphs.',
    writableKinds: ['paragraph'],
    tools: paragraphTools,
    provider: 'fictional',
    model: 'voice-model',
    transcriptionModel: 'transcription-model',
    events: { transcript: vi.fn(), audio: vi.fn(), error: vi.fn() },
    signal: new AbortController().signal,
    connect: (options) => {
      callbacks = options;
      return Promise.resolve({ mute: vi.fn(), interrupt: options.expire, close: vi.fn() });
    },
  });
  await expect(
    callbacks.execute(
      { callId: 'early', name: 'captureParagraph', input: { text: 'early' } },
      callbacks.signal,
    ),
  ).rejects.toThrow('No accepted');
  const at = '2026-10-10T12:00:00Z';
  await callbacks.acceptUser('speech', 'Capture this.', { started: at, ended: at });
  const result = await callbacks.execute(
    { callId: 'capture', name: 'captureParagraph', input: { text: 'hello' } },
    callbacks.signal,
  );
  expect(result).toMatchObject({ text: 'note:hello' });
  await callbacks.recordResponse('speech', [{ kind: 'text', text: 'Captured.' }], 'complete');
  const run = voice.snapshot().run!;
  const saved = await readAgentRun(nodes, run);
  expect(saved?.data).toMatchObject({
    status: 'complete',
    provider: 'fictional',
    model: { requested: 'voice-model' },
    output: { text: 'Captured.' },
  });
  expect(saved?.tools[0]?.data).toMatchObject({
    status: 'complete',
    input: { text: 'note:hello' },
    output: result,
  });
  expect(saved?.context.map(({ data }) => data.content)).toEqual([
    callbacks.instructions,
    'Capture this.',
  ]);
  const history = await nodes.history();
  expect(history.find(({ kind }) => kind.scope === 'paragraphFixture')).toMatchObject({
    recordedBy: 'agent',
    origin: run,
  });
  expect((await nodes.snapshot()).children(run).some(({ data }) => data?.kind === 'message')).toBe(
    false,
  );
  await voice.close();
});

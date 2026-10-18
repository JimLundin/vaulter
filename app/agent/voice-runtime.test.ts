import { tool } from 'ai';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  type AppendRequest,
  createPersistentStorage,
  type Journal,
} from '@/application/store/index.ts';
import { readAgentRun, startAgentRun } from './operations.ts';
import type { LiveVoiceOptions, VoiceHistory, VoicePart } from './voice.ts';
import { voiceFixture } from './voice-fixture.test-support.ts';
import { createVoiceAgent, type VoiceAgentOptions } from './voice-runtime.ts';

const at = '2026-10-10T12:00:00Z';
async function fixture(storage?: Parameters<typeof voiceFixture>[0]) {
  const base = await voiceFixture(storage);
  let callbacks!: LiveVoiceOptions<VoiceHistory, VoicePart>;
  const options: VoiceAgentOptions = {
    ...base,
    instructions: 'Capture paragraphs.',
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
  return { ...base, options, callbacks: () => callbacks };
}

test('voice retains effective instructions, canonical tool outcomes and content in EAV', async () => {
  const { db, options, callbacks: get, effects } = await fixture();
  await using _db = db;
  const voice = await createVoiceAgent(options);
  await expect(
    get().execute(
      { callId: 'early', name: 'captureParagraph', input: { text: 'early' } },
      get().signal,
    ),
  ).rejects.toThrow('No accepted');
  await get().acceptUser('speech', 'Capture this.', { started: at, ended: at });
  const output = await get().execute(
    { callId: 'capture', name: 'captureParagraph', input: { text: 'hello' } },
    get().signal,
  );
  await get().recordResponse('speech', [{ kind: 'text', text: 'Captured.' }], 'complete');
  const run = await db.transaction((tx) => readAgentRun(tx, voice.snapshot().run!));
  expect(run).toMatchObject({
    status: 'complete',
    output: { text: 'Captured.' },
    inputs: [{ content: get().instructions }, { content: 'Capture this.' }],
    executions: [{ status: 'complete', input: { text: 'note:hello' }, output }],
  });
  expect(effects).toHaveBeenCalledOnce();
  expect(await db.entities.notes.query({ select: { text: true } })).toMatchObject([
    { text: 'note:hello' },
  ]);
  await voice.close();
});

test('declarations are expired and each accepted voice turn gets a distinct context', async () => {
  const { db, options, callbacks: get } = await fixture();
  await using _db = db;
  const contexts: import('./tools.ts').AgentToolContext[] = [];
  const voice = await createVoiceAgent({
    ...options,
    tools: (context) => {
      contexts.push(context);
      return options.tools(context);
    },
  });
  expect(contexts[0]?.signal.aborted).toBe(true);
  expect(contexts[0]?.author).toBeUndefined();
  await get().acceptUser('first', 'First.', { started: at, ended: at });
  await get().recordResponse('first', [{ kind: 'text', text: 'Answer.' }], 'complete');
  await get().acceptUser('second', 'Second.', { started: at, ended: at });
  expect(contexts).toHaveLength(3);
  expect(contexts[1]?.signal.aborted).toBe(true);
  expect(contexts[2]?.signal.aborted).toBe(false);
  await voice.close();
  expect(contexts[2]?.signal.aborted).toBe(true);
});

test('changing declarations and approval requirements prevent executable effects', async () => {
  const { db, options, callbacks: get } = await fixture();
  await using _db = db;
  const voice = await createVoiceAgent({
    ...options,
    tools: (context) => (context.signal.aborted ? options.tools(context) : {}),
  });
  await expect(get().acceptUser('speech', 'First.', { started: at, ended: at })).rejects.toThrow(
    'must remain stable',
  );
  await voice.close();
  const connect = vi.fn(options.connect);
  await expect(
    createVoiceAgent({
      ...options,
      connect,
      tools: () => ({
        approval: tool({
          inputSchema: z.object({}),
          needsApproval: true,
          execute: async () => 'ok',
        }),
      }),
    }),
  ).rejects.toThrow('no approval requirement');
  expect(connect).not.toHaveBeenCalled();
});

test('caller preparation composes native records and cannot drop effective context', async () => {
  const { db, options, callbacks: get } = await fixture();
  await using _db = db;
  const onResponse = vi.fn(() => Promise.resolve());
  const voice = await createVoiceAgent({
    ...options,
    onResponse,
    prepareTurn: async (input, tx) => {
      await tx.entities.actors.insert({ name: input.text, kind: 'system' });
      return await startAgentRun(tx, {
        agent: options.agent,
        startedAt: new Date(input.timing.ended),
        instructions: input.instructions,
        inputs: input.context.slice(1),
      });
    },
  });
  await get().acceptUser('speech', 'Compose this.', { started: at, ended: at });
  expect(
    await db.entities.actors.first({ where: { name: { eq: 'Compose this.' } }, select: {} }),
  ).toBeDefined();
  await get().recordResponse('speech', [{ kind: 'text', text: 'Composed.' }], 'complete');
  expect(onResponse).toHaveBeenCalledWith(
    'speech',
    [{ kind: 'text', text: 'Composed.' }],
    expect.objectContaining({ phase: 'complete' }),
    'complete',
    expect.any(String),
  );
  await voice.close();
  const invalid = await createVoiceAgent({
    ...options,
    prepareTurn: (_input, tx) =>
      startAgentRun(tx, { agent: options.agent, startedAt: new Date(at), inputs: [] }),
  });
  await expect(get().acceptUser('invalid', 'Missing.', { started: at, ended: at })).rejects.toThrow(
    'retain effective session inputs',
  );
  await invalid.close();
  expect(await db.entities.agentRuns.query({ select: {} })).toHaveLength(1);
});

test('Close expires held caller preparation and rolls back late writes', async () => {
  const { db, options, callbacks: get } = await fixture();
  await using _db = db;
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const voice = await createVoiceAgent({
    ...options,
    prepareTurn: async (input, tx) => {
      enter();
      await held;
      await tx.entities.actors.insert({ name: 'Late', kind: 'system' });
      return await startAgentRun(tx, {
        agent: options.agent,
        startedAt: new Date(at),
        instructions: input.instructions,
        inputs: input.context.slice(1),
      });
    },
  });
  const accepting = get().acceptUser('speech', 'Close.', { started: at, ended: at });
  const rejected = expect(accepting).rejects.toMatchObject({ name: 'AbortError' });
  await entered;
  await voice.close();
  await rejected;
  release();
  await vi.waitFor(async () =>
    expect(
      await db.entities.actors.first({ where: { name: { eq: 'Late' } }, select: {} }),
    ).toBeUndefined(),
  );
  await expect(get().acceptUser('late', 'Late.', { started: at, ended: at })).rejects.toMatchObject(
    { name: 'AbortError' },
  );
});

test('caller transcript retries retain identity and do not repeat effects', async () => {
  const { db, options, callbacks: get, effects } = await fixture();
  await using _db = db;
  let offline = true;
  const projections: unknown[] = [];
  const voice = await createVoiceAgent({
    ...options,
    onResponse: (_item, parts, _state, status, id) => {
      if (status !== 'complete') return Promise.resolve();
      projections.push({ parts, id });
      // biome-ignore lint/suspicious/noUnnecessaryConditions: Explicit recovery changes transport availability.
      return offline ? Promise.reject(new Error('Transcript offline')) : Promise.resolve();
    },
  });
  await get().acceptUser('speech', 'Capture.', { started: at, ended: at });
  await get().execute(
    { callId: 'capture', name: 'captureParagraph', input: { text: 'hello' } },
    get().signal,
  );
  await expect(
    get().recordResponse('speech', [{ kind: 'text', text: 'Captured.' }], 'complete'),
  ).rejects.toThrow('Transcript offline');
  await voice.close();
  offline = false;
  await voice.retrySave();
  expect(projections[1]).toEqual(projections[0]);
  expect(effects).toHaveBeenCalledOnce();
  expect(voice.snapshot().phase).toBe('closed');
});

test('closing with a terminal save failure retains exact persistence-only recovery', async () => {
  let journal: Journal = { commits: [], schemas: [] };
  let offline = false;
  const saves: AppendRequest[] = [];
  const storage = createPersistentStorage({
    scope: 'voice',
    load: () => Promise.resolve(journal),
    append: (request) => {
      const terminal = request.commit.facts.some(
        (fact) => fact.attribute === 'agent.run/status' && fact.value === 'running' && !fact.added,
      );
      if (terminal) {
        saves.push(request);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: Explicit recovery changes transport availability.
        if (offline) return Promise.reject(new Error('Terminal offline'));
      }
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
      return Promise.resolve();
    },
  });
  const { db, options, callbacks: get } = await fixture(storage);
  await using _db = db;
  const voice = await createVoiceAgent(options);
  await get().acceptUser('speech', 'Capture.', { started: at, ended: at });
  offline = true;
  await get().recordResponse('speech', [{ kind: 'text', text: 'Completed.' }], 'complete');
  expect(voice.snapshot().phase).toBe('unsaved');
  await voice.close();
  offline = false;
  await voice.retrySave();
  expect(saves[1]).toEqual(saves[0]);
  expect((await db.transaction((tx) => readAgentRun(tx, voice.snapshot().run!)))?.status).toBe(
    'complete',
  );
  await voice.retrySave();
  expect(saves).toHaveLength(2);
  expect(await db.entities.agentRuns.query({ select: {} })).toHaveLength(1);
});

test('uncertain initial acceptance retries exact publication and never starts a recovered run', async () => {
  let journal: Journal = { commits: [], schemas: [] };
  let offline = false;
  const admissions: AppendRequest[] = [];
  const storage = createPersistentStorage({
    scope: 'voice-initial',
    load: () => Promise.resolve(journal),
    append: (request) => {
      const initial = request.commit.facts.some(
        (fact) => fact.attribute === 'agent.run/status' && fact.added && fact.value === 'running',
      );
      if (initial) {
        admissions.push(request);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: Explicit recovery changes transport availability.
        if (offline) return Promise.reject(new Error('Initial offline'));
      }
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
      return Promise.resolve();
    },
  });
  const { db, options, callbacks: get, effects } = await fixture(storage);
  await using _db = db;
  const voice = await createVoiceAgent(options);
  offline = true;
  await expect(
    get().acceptUser('speech', 'Retain this.', { started: at, ended: at }),
  ).rejects.toThrow();
  expect(voice.snapshot().phase).toBe('unsaved');
  await voice.close();
  offline = false;
  await voice.retrySave();
  expect(admissions[1]).toEqual(admissions[0]);
  const run = await db.transaction((tx) => readAgentRun(tx, voice.snapshot().run!));
  expect(run).toMatchObject({
    status: 'interrupted',
    finishReason: 'admissionNotExecuted',
    inputs: [{ content: get().instructions }, { content: 'Retain this.' }],
  });
  expect(effects).not.toHaveBeenCalled();
  expect(voice.snapshot().phase).toBe('closed');
  await voice.retrySave();
  expect(admissions).toHaveLength(2);
});

import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { chatFixture } from './fixtures.test-support.ts';
import { createConversation } from './conversation.ts';
import {
  createPersistentStorage,
  type Journal,
  type AppendRequest,
} from '@/application/store/index.ts';

function toolOutcomeStorage(reject: (request: AppendRequest) => boolean) {
  let journal: Journal = { commits: [], schemas: [] };
  return createPersistentStorage({
    scope: 'conversation-tools',
    load: async () => journal,
    append: (request) => {
      const outcome = request.commit.facts.some(
        (fact) =>
          fact.attribute === 'agent.toolExecution/status' &&
          !fact.added &&
          fact.value === 'running',
      );
      if (outcome && reject(request)) return Promise.reject(new Error('Outcome offline'));
      journal = {
        schemas: request.schemas,
        commits: [...journal.commits, request.commit],
      };
      return Promise.resolve();
    },
  });
}

test('conversation keeps its draft and execution across view close and reconstructs accepted messages', async () => {
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Recorded.' },
        { type: 'text-end', id: 't' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
        },
      ]),
    }),
  });
  const options = {
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: async () => model,
    selectedModel: 'fictional',
    instructions: 'Record useful content.',
  };
  const controller = createConversation(options);
  controller.setDraft('A dictated draft');
  const close = controller.viewing();
  close();
  expect(controller.snapshot().draft).toBe('A dictated draft');
  const submitted = controller.prepareSubmission();
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await submitted.done;
  expect(controller.snapshot()).toMatchObject({
    draft: '',
    busy: false,
    unread: true,
  });
  expect(controller.snapshot().turns.map(({ role }) => role)).toEqual(['user', 'agent']);
  const reopened = createConversation({
    ...options,
    model: () => Promise.reject(new Error('Must not execute')),
  });
  await reopened.reload();
  expect(reopened.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
  expect(model.doStreamCalls).toHaveLength(1);
  controller.dispose();
  reopened.dispose();
});

test('updated caller model dependencies are used by the next Send', async () => {
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  let old = 0;
  let next = 0;
  const base = {
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record useful content.',
  };
  const controller = createConversation({
    ...base,
    model: () => {
      old++;
      return Promise.reject(new Error('Old'));
    },
  });
  controller.updateOptions({
    ...base,
    model: () => {
      next++;
      return Promise.reject(new Error('New'));
    },
  });
  const submitted = controller.prepareSubmission({
    text: 'Use new dependencies',
  });
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await submitted.done;
  expect(old).toBe(0);
  expect(next).toBe(1);
});

test('disposal prevents late execution completion from changing a closed controller snapshot', async () => {
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  let entered!: () => void;
  const loading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const controller = createConversation({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => {
      entered();
      return new Promise(() => {
        /* held provider */
      });
    },
  });
  const sending = controller.prepareSubmission({ text: 'A message' });
  if (sending.status !== 'owned') throw new Error('Expected retained request');
  await loading;
  const snapshot = controller.snapshot();
  controller.dispose();
  await sending.done;
  expect(controller.snapshot()).toBe(snapshot);
});

test('recovery keeps the controller busy while Agent resumes into a held provider step', async () => {
  let failing = true;
  const { db, options: baseOptions } = await chatFixture(toolOutcomeStorage(() => failing));
  await using _db = db;
  let resumed!: () => void;
  let release!: () => void;
  const second = new Promise<void>((resolve) => {
    resumed = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  type Part =
    Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<
      infer Value
    >
      ? Value
      : never;
  let steps = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const next = steps++;
      if (next === 1) {
        resumed();
        await held;
      }
      const parts: Part[] =
        next === 0
          ? [
              {
                type: 'tool-call',
                toolName: 'publish',
                toolCallId: 'call',
                input: '{}',
              },
            ]
          : [
              { type: 'text-start', id: 't' },
              { type: 'text-delta', id: 't', delta: 'Done' },
              { type: 'text-end', id: 't' },
            ];
      return {
        stream: convertArrayToReadableStream<Part>([
          { type: 'stream-start', warnings: [] },
          ...parts,
          {
            type: 'finish',
            finishReason: {
              unified: next === 0 ? 'tool-calls' : 'stop',
              raw: undefined,
            },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ]),
      };
    },
  });
  const controller = createConversation({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: async () => model,
    settings: { maxSteps: 2 },
    enabledTools: [{ name: 'publish' }],
    tools: () => ({
      publish: tool({ inputSchema: z.object({}), execute: () => 'Published' }),
    }),
  });
  const sending = controller.prepareSubmission({ text: 'A message' });
  if (sending.status !== 'owned') throw new Error('Expected retained request');
  await new Promise<void>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      if (controller.snapshot().phase === 'paused') {
        unsubscribe();
        resolve();
      }
    });
  });
  failing = false;
  await controller.retrySave();
  await second;
  expect(controller.snapshot().busy).toBe(true);
  expect(controller.snapshot().phase).toBe('running');
  release();
  await sending.done;
  expect(controller.snapshot().busy).toBe(false);
});

test('Chat optional suggestions preserve the shared draft and unavailable storage prevent submission', async () => {
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  const controller = createConversation({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: () => Promise.reject(new Error('Must not execute')),
    selectedModel: 'fictional',
    instructions: 'Record.',
    suggestions: async () => ['Make room for walks'],
    availability: 'Offline',
  });
  controller.setDraft('A retained thought');
  expect(controller.prepareSubmission()).toEqual({
    status: 'blocked',
    reason: 'Offline',
  });
  expect(controller.snapshot()).toMatchObject({
    draft: 'A retained thought',
    turns: [],
  });
  expect(controller.snapshot().submissionAvailability.allowed).toBe(false);
  controller.updateOptions({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: () => Promise.reject(new Error('Must not execute')),
    selectedModel: 'fictional',
    instructions: 'Record.',
    suggestions: async () => ['Make room for walks'],
  });
  await controller.suggest();
  expect(controller.snapshot()).toMatchObject({
    draft: 'A retained thought',
    suggestions: ['Make room for walks'],
  });
  controller.dispose();
});

test('Chat caches suggestions per model and discards late suggestions after Send, model changes and disposal', async () => {
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  let requested = 0;
  let release!: (value: string[]) => void;
  const suggestions = () => {
    requested++;
    return new Promise<string[]>((resolve) => {
      release = resolve;
    });
  };
  const options = {
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('No model requested for suggestions')),
    suggestions,
  };
  const chat = createConversation(options);
  const first = chat.suggest();
  await chat.suggest();
  expect(requested).toBe(1);
  chat.updateOptions({ ...options, selectedModel: 'another' });
  release(['Stale']);
  await first;
  expect(chat.snapshot().suggestions).toEqual([]);
  const second = chat.suggest();
  release(['Current']);
  await second;
  expect(chat.snapshot().suggestions).toEqual(['Current']);
  chat.updateOptions({
    ...options,
    selectedModel: 'third',
  });
  const third = chat.suggest();
  chat.dispose();
  release(['Disposed']);
  await third;
  expect(chat.snapshot().suggestions).toEqual(['Current']);
});

test('Chat Stop expires a held module tool factory and failed factories allow another explicit Send', async () => {
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  const model = new MockLanguageModelV4();
  let entered!: () => void;
  const factoryEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let factorySignal!: AbortSignal;
  const options = {
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: async () => model,
  };
  const chat = createConversation({
    ...options,
    tools: async (current) => {
      factorySignal = current.signal;
      entered();
      await held;
      return {};
    },
  });
  const sending = chat.prepareSubmission({ text: 'First' });
  if (sending.status !== 'owned') throw new Error('Expected retained request');
  await factoryEntered;
  chat.stop();
  await sending.done;
  expect(chat.snapshot().busy).toBe(false);
  expect(factorySignal.aborted).toBe(true);
  release();
  expect(model.doStreamCalls).toHaveLength(0);
  chat.updateOptions({
    ...options,
    tools: () => Promise.reject(new Error('Factory failed')),
  });
  const failedFactory = chat.prepareSubmission({ text: 'Second' });
  if (failedFactory.status !== 'owned') throw new Error('Expected retained request');
  await failedFactory.done;
  expect(chat.snapshot().turns.at(-1)?.error).toBe('Factory failed');
  chat.updateOptions({
    ...options,
    model: () => Promise.reject(new Error('Next explicit attempt')),
  });
  const nextAttempt = chat.prepareSubmission({ text: 'Third' });
  if (nextAttempt.status !== 'owned') throw new Error('Expected retained request');
  await nextAttempt.done;
  expect(chat.snapshot().turns.at(-1)?.error).toBe('Next explicit attempt');
  chat.dispose();
});

test('Send cancels pending suggestions and suggestion failure leaves Chat message entry usable', async () => {
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  let release!: (values: string[]) => void;
  let signal!: AbortSignal;
  const options = {
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('Explicit execution completed with an error')),
  };
  const chat = createConversation({
    ...options,
    suggestions: (_context, cancellation) => {
      signal = cancellation;
      return new Promise<string[]>((resolve) => {
        release = resolve;
      });
    },
  });
  const suggesting = chat.suggest();
  const submitted = chat.prepareSubmission({
    text: 'An explicit user message',
  });
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await submitted.done;
  expect(signal.aborted).toBe(true);
  release(['Late suggestion']);
  await suggesting;
  expect(chat.snapshot().suggestions).toEqual([]);
  chat.updateOptions({
    ...options,
    suggestions: () => Promise.reject(new Error('Suggestions offline')),
  });
  await chat.suggest();
  chat.setDraft('Another message');
  expect(chat.snapshot().submissionAvailability.allowed).toBe(true);
  const nextSubmission = chat.prepareSubmission();
  if (nextSubmission.status !== 'owned') throw new Error('Expected retained request');
  await nextSubmission.done;
  expect(chat.snapshot().turns.filter(({ role }) => role === 'user')).toHaveLength(2);
  chat.dispose();
});

test('only the exact unsaved Tool outcome carries pending-save evidence beside prior accepted calls', async () => {
  let rejectOutcome = true;
  let outcomes = 0;
  const { db, options: baseOptions } = await chatFixture(
    toolOutcomeStorage(() => ++outcomes === 2 && rejectOutcome),
  );
  await using _db = db;
  const controller = createConversation({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    enabledTools: [{ name: 'record', version: 'v1' }],
    tools: () => ({
      record: tool({
        inputSchema: z.object({}),
        execute: () => ({ accepted: true }),
      }),
    }),
    execution: async ({ tools, messages, signal }) => {
      const definition = tools.record!;
      if (definition.type === 'provider' || !definition.execute) throw new Error('Expected tool');
      await definition.execute(
        {},
        {
          toolCallId: 'first',
          messages: [...messages],
          abortSignal: signal,
          context: {},
        },
      );
      await definition.execute(
        {},
        {
          toolCallId: 'second',
          messages: [...messages],
          abortSignal: signal,
          context: {},
        },
      );
      return { status: 'complete', text: 'Recorded.' };
    },
  });
  const sending = controller.prepareSubmission({ text: 'Record both.' });
  if (sending.status !== 'owned') throw new Error('Expected retained request');
  await new Promise<void>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      if (controller.snapshot().phase === 'paused') {
        unsubscribe();
        resolve();
      }
    });
  });
  const parts = controller.snapshot().turns.at(-1)?.parts;
  expect(parts?.[0]).toMatchObject({
    callId: 'first',
    version: 'v1',
    status: 'complete',
  });
  expect(parts?.[0]).not.toHaveProperty('savePending');
  expect(parts?.[1]).toMatchObject({
    callId: 'second',
    version: 'v1',
    status: 'complete',
    savePending: true,
  });
  rejectOutcome = false;
  await controller.retrySave();
  await sending.done;
  expect(
    controller
      .snapshot()
      .turns.at(-1)
      ?.parts.some((part) => part.kind === 'tool' && part.savePending),
  ).toBe(false);
  controller.dispose();
});

import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import { createNodeConversation } from './node-conversation.ts';

test('opening a retained summary displays the record without executing an Agent or inventing dialogue', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  const at = '2026-06-05T00:00:00+02:00';
  await nodes.commit(
    request('summary', [
      create('daily', { kind: 'conversation', title: 'Studio time', createdAt: at }),
      create('day', { kind: 'exchange', startedAt: at, startedAtPrecision: 'day' }, 'daily'),
      create(
        'record',
        {
          kind: 'message',
          role: 'record',
          at,
          atPrecision: 'day',
          text: 'Kept **studio time** free.',
          record: { kind: 'summary', label: 'Daily summary' },
        },
        'day',
      ),
    ]),
  );
  let executions = 0;
  const controller = createNodeConversation({
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => {
      executions++;
      return Promise.reject(new Error('Reading must not execute'));
    },
  });
  const before = await nodes.history();
  expect((await controller.open('daily')).status).toBe('selected');
  expect(controller.snapshot().turns).toEqual([
    {
      role: 'record',
      at,
      record: { kind: 'summary', label: 'Daily summary' },
      parts: [{ kind: 'text', text: 'Kept **studio time** free.' }],
    },
  ]);
  expect(controller.snapshot().busy).toBe(false);
  expect(executions).toBe(0);
  expect(await nodes.history()).toEqual(before);
  controller.dispose();
  nodes.close();
});

test('node-backed conversation keeps its draft and execution across view close and reconstructs accepted messages', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
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
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: async () => model,
    selectedModel: 'fictional',
    instructions: 'Record useful content.',
  };
  const controller = createNodeConversation(options);
  controller.setDraft('A dictated draft');
  const close = controller.viewing();
  close();
  expect(controller.snapshot().draft).toBe('A dictated draft');
  const submitted = controller.prepareSubmission();
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await submitted.done;
  expect(controller.snapshot()).toMatchObject({ draft: '', busy: false, unread: true });
  const conversation = controller.conversation();
  expect(controller.snapshot().turns.map(({ role }) => role)).toEqual(['user', 'agent']);
  const reopened = createNodeConversation({
    ...options,
    conversation,
    model: () => Promise.reject(new Error('Must not execute')),
  });
  await reopened.open(conversation);
  expect(reopened.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
  expect(model.doStreamCalls).toHaveLength(1);
  controller.dispose();
  reopened.dispose();
});

test('updated caller model dependencies are used by the next node-backed Send', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  let old = 0;
  let next = 0;
  const base = {
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record useful content.',
  };
  const controller = createNodeConversation({
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
  const submitted = controller.prepareSubmission({ text: 'Use new dependencies' });
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await submitted.done;
  expect(old).toBe(0);
  expect(next).toBe(1);
});

test('disposal prevents late execution completion from changing a closed controller snapshot', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  let entered!: () => void;
  const loading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const controller = createNodeConversation({
    nodes,
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
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  let failing = true;
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
          ? [{ type: 'tool-call', toolName: 'publish', toolCallId: 'call', input: '{}' }]
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
            finishReason: { unified: next === 0 ? 'tool-calls' : 'stop', raw: undefined },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ]),
      };
    },
  });
  const controller = createNodeConversation({
    nodes: {
      ...nodes,
      commit: (value) =>
        value.kind.action === 'completeTool' && failing
          ? Promise.reject(new Error('Offline'))
          : nodes.commit(value),
    },
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: async () => model,
    settings: { maxSteps: 2 },
    enabledTools: [{ name: 'publish' }],
    tools: () => ({ publish: tool({ inputSchema: z.object({}), execute: () => 'Published' }) }),
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

test('Chat publishes content with the module-owned node tools and retains exact history', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  const { nodeContentTools } = await import('../../vault/content/tools.ts');
  let step = 0;
  const scripted = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...(step++ === 0
          ? [
              {
                type: 'tool-call' as const,
                toolCallId: 'publish',
                toolName: 'createNode',
                input: JSON.stringify({ title: 'A saved thought', text: 'Keep mornings free.' }),
              },
            ]
          : [
              { type: 'text-start' as const, id: 't' },
              { type: 'text-delta' as const, id: 't', delta: 'Saved.' },
              { type: 'text-end' as const, id: 't' },
            ]),
        {
          type: 'finish',
          finishReason: { unified: step === 1 ? 'tool-calls' : 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
        },
      ]),
    }),
  });
  const controller = createNodeConversation({
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: async () => scripted,
    settings: { maxSteps: 2 },
    tools: nodeContentTools,
    writableKinds: ['content'],
    enabledTools: [{ name: 'createNode' }, { name: 'readNode' }, { name: 'updateNode' }],
  });
  const submitted = controller.prepareSubmission({ text: 'Remember this.' });
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await submitted.done;
  const history = await nodes.history({ kinds: [{ scope: 'node', action: 'create' }] });
  expect(history).toHaveLength(1);
  expect(history[0]?.recordedBy).toBe('agent');
  const changes = await nodes.changes(history[0]!.id);
  expect(changes[0]?.after.data).toEqual({
    kind: 'content',
    title: 'A saved thought',
    text: 'Keep mornings free.',
  });
  expect(controller.snapshot().turns[1]?.parts[0]).toMatchObject({
    kind: 'tool',
    name: 'createNode',
    result: 'Accepted',
  });
});

test('node Chat optional suggestions preserve the shared draft and unavailable nodes prevent submission', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent' })]));
  const controller = createNodeConversation({
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: async () => {
      throw new Error('Must not execute');
    },
    selectedModel: 'fictional',
    instructions: 'Record.',
    suggestions: async () => ['Make room for walks'],
    availability: 'Offline',
  });
  controller.setDraft('A retained thought');
  expect(controller.prepareSubmission()).toEqual({ status: 'blocked', reason: 'Offline' });
  expect(controller.snapshot()).toMatchObject({ draft: 'A retained thought', turns: [] });
  expect(controller.snapshot().submissionAvailability.allowed).toBe(false);
  controller.updateOptions({
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: async () => {
      throw new Error('Must not execute');
    },
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

test('node Chat caches suggestions per model and discards late suggestions after Send, new chat and disposal', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent' })]));
  let requested = 0;
  let release!: (value: string[]) => void;
  const suggestions = () => {
    requested++;
    return new Promise<string[]>((resolve) => {
      release = resolve;
    });
  };
  const options = {
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('No model requested for suggestions')),
    suggestions,
  };
  const chat = createNodeConversation(options);
  const first = chat.suggest();
  await chat.suggest();
  expect(requested).toBe(1);
  chat.newChat();
  release(['Stale']);
  await first;
  expect(chat.snapshot().suggestions).toEqual([]);
  const second = chat.suggest();
  release(['Current']);
  await second;
  expect(chat.snapshot().suggestions).toEqual(['Current']);
  chat.updateOptions({ ...options, selectedModel: 'another' });
  const third = chat.suggest();
  chat.dispose();
  release(['Disposed']);
  await third;
  expect(chat.snapshot().suggestions).toEqual(['Current']);
});

test('node Chat Stop expires a held module tool factory and failed factories allow another explicit Send', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent' })]));
  const model = new MockLanguageModelV4();
  let entered!: () => void;
  const factoryEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let context!: import('../../agent/tools.ts').AgentToolContext;
  const options = {
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: async () => model,
  };
  const chat = createNodeConversation({
    ...options,
    tools: async (current) => {
      context = current;
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
  expect(() => context.snapshot()).toThrow(/stopped/i);
  release();
  expect(model.doStreamCalls).toHaveLength(0);
  chat.updateOptions({ ...options, tools: () => Promise.reject(new Error('Factory failed')) });
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

test('Send cancels pending suggestions and suggestion failure leaves node Chat message entry usable', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent' })]));
  let release!: (values: string[]) => void;
  let signal!: AbortSignal;
  const options = {
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('Explicit execution completed with an error')),
  };
  const chat = createNodeConversation({
    ...options,
    suggestions: (_context, cancellation) => {
      signal = cancellation;
      return new Promise<string[]>((resolve) => {
        release = resolve;
      });
    },
  });
  const suggesting = chat.suggest();
  const submitted = chat.prepareSubmission({ text: 'An explicit user message' });
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

import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import { createNodeConversation } from './node-conversation.ts';

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
  await controller.sendDraft();
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
  await controller.send('Use new dependencies');
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
  const sending = controller.send('A message');
  await loading;
  const snapshot = controller.snapshot();
  controller.dispose();
  await sending;
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
  const sending = controller.send('A message');
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
  await sending;
  expect(controller.snapshot().busy).toBe(false);
});

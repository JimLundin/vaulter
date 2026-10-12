import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import { createNodeConversation } from './node-conversation.ts';

async function fixture() {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('actors', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  return {
    nodes,
    options: {
      nodes,
      user: 'user',
      agent: 'agent',
      provider: 'fictional',
      selectedModel: 'fictional',
      instructions: 'Keep a reliable record.',
      execution: async () => ({ status: 'complete' as const, text: 'Recorded.' }),
    },
  };
}

test('an unseen completed reply remains unread through failed record refresh and recovery until a view acknowledges it', async () => {
  const { nodes, options } = await fixture();
  let readsFail = false;
  let executions = 0;
  const conversation = createNodeConversation({
    ...options,
    nodes: {
      ...nodes,
      snapshot: (sequence) =>
        readsFail
          ? Promise.reject(new Error('Recorded view unavailable'))
          : nodes.snapshot(sequence),
      commit: async (value) => {
        const accepted = await nodes.commit(value);
        if (value.kind.action === 'completeResponse') readsFail = true;
        return accepted;
      },
    },
    execution: async () => {
      executions++;
      return await options.execution();
    },
  });
  try {
    conversation.setDraft('Reply while Chat is hidden');
    const submitted = conversation.prepareSubmission();
    if (submitted.status !== 'owned') throw new Error('Expected retained request');
    await submitted.done;
    expect(conversation.snapshot().recovery.refresh?.error).toBe('Recorded view unavailable');
    expect(conversation.snapshot().unread).toBe(true);
    readsFail = false;
    await conversation.refreshContext();
    expect(conversation.snapshot().recovery).toEqual({});
    expect(conversation.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
    expect(conversation.snapshot().unread).toBe(true);
    const close = conversation.viewing();
    expect(conversation.snapshot().unread).toBe(false);
    close();
    await conversation.refreshContext();
    expect(conversation.snapshot().unread).toBe(false);
    expect(executions).toBe(1);
  } finally {
    conversation.dispose();
    nodes.close();
  }
});

test('views share initial-acceptance recovery progress and reconciliation never executes unknown history', async () => {
  const { nodes, options } = await fixture();
  let failed = true;
  let retries = 0;
  let executions = 0;
  let release!: () => void;
  const holding = new Promise<void>((resolve) => {
    release = resolve;
  });
  const conversation = createNodeConversation({
    ...options,
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.changes.some(({ data }) => data?.kind === 'exchange')) {
          if (failed) throw new Error('Acceptance response unavailable');
          retries++;
          await holding;
        }
        return nodes.commit(value);
      },
    },
    execution: async () => {
      executions++;
      return await options.execution();
    },
  });
  conversation.setDraft('Retain this request');
  const submitted = conversation.prepareSubmission();
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await vi.waitFor(() => expect(conversation.snapshot().phase).toBe('unsaved'));
  expect(conversation.snapshot().recovery.save).toMatchObject({
    stage: 'initial',
    error: 'Acceptance response unavailable',
    inProgress: false,
    allowed: true,
  });
  conversation.setDraft('A newer draft');
  failed = false;
  const first = conversation.retrySave();
  const second = conversation.retrySave();
  await vi.waitFor(() => expect(retries).toBe(1));
  expect(conversation.snapshot().recovery.save).toMatchObject({ inProgress: true, allowed: false });
  expect(conversation.snapshot().submission?.id).toBe(submitted.request.id);
  expect(conversation.snapshot().draft).toBe('A newer draft');
  release();
  await Promise.all([first, second, submitted.done]);
  expect(conversation.snapshot().recovery.save).toBeUndefined();
  expect(conversation.snapshot().phase).toBe('recorded');
  expect(conversation.snapshot().draft).toBe('A newer draft');
  expect(executions).toBe(0);
  conversation.dispose();
  nodes.close();
});

test('Chat response saving and accepted-record refresh remain separate shared obligations after Agent completes', async () => {
  const { nodes, options } = await fixture();
  let responseFails = true;
  let readsFail = false;
  let executions = 0;
  let responseRetries = 0;
  let refreshReads = 0;
  let holdReads = false;
  let releaseSave!: () => void;
  let releaseRead!: () => void;
  const saving = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const conversation = createNodeConversation({
    ...options,
    nodes: {
      ...nodes,
      snapshot: async (sequence) => {
        if (readsFail) throw new Error('Recorded view unavailable');
        if (holdReads) {
          refreshReads++;
          await reading;
        }
        return nodes.snapshot(sequence);
      },
      commit: async (value) => {
        if (value.kind.action === 'completeRun') readsFail = true;
        if (value.kind.action === 'completeResponse') {
          if (responseFails) throw new Error('Response save unavailable');
          responseRetries++;
          await saving;
        }
        return nodes.commit(value);
      },
    },
    execution: async () => {
      executions++;
      return await options.execution();
    },
  });
  conversation.setDraft('First request');
  const submitted = conversation.prepareSubmission();
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  await submitted.done;
  expect(conversation.snapshot().recovery).toMatchObject({
    save: { stage: 'response', error: 'Response save unavailable' },
    refresh: { error: 'Recorded view unavailable' },
  });
  conversation.setDraft('Next request');
  conversation.stop();
  responseFails = false;
  const first = conversation.retrySave();
  const second = conversation.retrySave();
  await vi.waitFor(() => expect(responseRetries).toBe(1));
  expect(conversation.snapshot().recovery.save?.inProgress).toBe(true);
  releaseSave();
  await Promise.all([first, second]);
  expect(conversation.snapshot().recovery.save).toBeUndefined();
  expect(conversation.snapshot().recovery.refresh?.error).toBe('Recorded view unavailable');
  expect(conversation.snapshot().unread).toBe(true);
  readsFail = false;
  holdReads = true;
  const refresh = conversation.refreshContext();
  const refreshAgain = conversation.refreshContext();
  await vi.waitFor(() => expect(refreshReads).toBeGreaterThan(0));
  expect(conversation.snapshot().recovery.refresh).toMatchObject({
    inProgress: true,
    allowed: false,
  });
  releaseRead();
  await Promise.all([refresh, refreshAgain]);
  expect(conversation.snapshot().recovery).toEqual({});
  expect(conversation.snapshot().draft).toBe('Next request');
  expect(conversation.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
  expect(conversation.snapshot().unread).toBe(true);
  const close = conversation.viewing();
  expect(conversation.snapshot().unread).toBe(false);
  close();
  await conversation.retrySave();
  expect(conversation.snapshot().unread).toBe(false);
  expect(executions).toBe(1);
  conversation.dispose();
  nodes.close();
});

test('a completed recovery read cannot replace a newly admitted conversation or draft', async () => {
  const { nodes, options } = await fixture();
  let failed = true;
  let holdRead = false;
  let entered!: () => void;
  let release!: () => void;
  const entering = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acceptedOldResponse = false;
  const conversation = createNodeConversation({
    ...options,
    nodes: {
      ...nodes,
      snapshot: async (sequence) => {
        if (holdRead) {
          holdRead = false;
          entered();
          await waiting;
        }
        return nodes.snapshot(sequence);
      },
      commit: async (value) => {
        if (value.kind.action === 'completeResponse') {
          if (failed) throw new Error('Response unavailable');
          const accepted = await nodes.commit(value);
          if (!acceptedOldResponse) {
            acceptedOldResponse = true;
            holdRead = true;
          }
          return accepted;
        }
        return nodes.commit(value);
      },
    },
  });
  const previous = conversation.prepareSubmission({ text: 'Previous request' });
  if (previous.status !== 'owned') throw new Error('Expected retained request');
  await previous.done;
  failed = false;
  const retry = conversation.retrySave();
  await entering;
  conversation.newChat();
  const selected = conversation.conversation();
  conversation.setDraft('New conversation draft');
  failed = true;
  const newRequest = conversation.prepareSubmission({ text: 'New request' });
  if (newRequest.status !== 'owned') throw new Error('Expected retained request');
  await newRequest.done;
  failed = false;
  const newRetry = conversation.retrySave();
  expect(newRetry).not.toBe(retry);
  await newRetry;
  const newerTurns = conversation.snapshot().turns;
  release();
  await retry;
  expect(conversation.conversation()).toBe(selected);
  expect(conversation.snapshot().turns).toBe(newerTurns);
  expect(conversation.snapshot().draft).toBe('New conversation draft');
  conversation.dispose();
  nodes.close();
});

test('content publication recovery never conceals the separate completed outcome save obligation', async () => {
  const { nodes, options } = await fixture();
  const { tool } = await import('ai');
  const { z } = await import('zod');
  const { nodeOperations } = await import('../../vault/nodes/operations.ts');
  const { MockLanguageModelV4, convertArrayToReadableStream } = await import('ai/test');
  let contentFails = true;
  let outcomeFails = true;
  let attempts = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const conversation = createNodeConversation({
    ...options,
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.id === 'content') {
          if (contentFails) throw new Error('Content acceptance unavailable');
          await waiting;
        }
        if (value.kind.action === 'completeTool' && outcomeFails)
          throw new Error('Outcome save unavailable');
        return nodes.commit(value);
      },
    },
    writableKinds: ['paragraph'],
    enabledTools: [{ name: 'publish' }],
    tools: (context) => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: async () => {
          attempts++;
          return {
            transaction: await context.commit({
              id: 'content',
              kind: nodeOperations.create,
              message: null,
              changes: [create('content', { kind: 'paragraph', text: 'Retained content' })],
            }),
          };
        },
      }),
    }),
    execution: undefined,
    model: async () =>
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolName: 'publish', toolCallId: 'publish', input: '{}' },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ]),
        }),
      }),
  });
  const sending = conversation.prepareSubmission({ text: 'Publish' });
  if (sending.status !== 'owned') throw new Error('Expected retained request');
  await vi.waitFor(() => expect(conversation.snapshot().phase).toBe('paused'));
  expect(conversation.snapshot().recovery).toMatchObject({
    save: { stage: 'outcome', error: 'Outcome save unavailable' },
    content: { error: 'Content acceptance unavailable' },
  });
  conversation.setDraft('A newer draft');
  conversation.stop();
  contentFails = false;
  const first = conversation.retryContentSave();
  const second = conversation.retryContentSave();
  await vi.waitFor(() => expect(conversation.snapshot().recovery.content?.inProgress).toBe(true));
  expect(conversation.snapshot().recovery.save?.stage).toBe('outcome');
  release();
  await Promise.all([first, second]);
  expect(conversation.snapshot().recovery.content).toBeUndefined();
  expect(conversation.snapshot().recovery.save?.stage).toBe('outcome');
  outcomeFails = false;
  await conversation.retrySave();
  await sending.done;
  expect(conversation.snapshot().recovery).toEqual({});
  expect(conversation.snapshot().draft).toBe('A newer draft');
  expect(attempts).toBe(1);
  expect(conversation.snapshot().turns[1]?.parts[0]).toMatchObject({
    kind: 'tool',
    error: true,
    result: 'Content acceptance unavailable',
  });
  conversation.dispose();
  nodes.close();
});

test('a synchronous observer cannot start a competing owner retry during admission', async () => {
  const { nodes, options } = await fixture();
  const { createNodeChatBackend } = await import('./node-backend.ts');
  let failing = true;
  let attempts = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeResponse') {
          attempts++;
          if (failing) throw new Error('Response unavailable');
          await waiting;
        }
        return nodes.commit(value);
      },
    },
  });
  const retained = backend.send({
    id: 'request',
    conversation: 'conversation',
    text: 'Retain',
    model: 'fictional',
  });
  await retained.done;
  let observed = false;
  let concurrent!: Promise<unknown>;
  retained.subscribe(() => {
    if (observed || !retained.snapshot().recovery?.save?.inProgress) return;
    observed = true;
    concurrent = retained.retrySave();
  });
  failing = false;
  const retry = retained.retrySave();
  await vi.waitFor(() => expect(observed).toBe(true));
  release();
  await Promise.all([retry, concurrent]);
  expect(attempts).toBe(2);
  backend.dispose();
  nodes.close();
});

test('a failed retry returns settled owner progress while retaining its exact recovery obligation', async () => {
  const { nodes, options } = await fixture();
  const { createNodeChatBackend } = await import('./node-backend.ts');
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: (value) =>
        value.kind.action === 'completeResponse'
          ? Promise.reject(new Error('Response unavailable'))
          : nodes.commit(value),
    },
  });
  const retained = backend.send({
    id: 'request',
    conversation: 'conversation',
    text: 'Retain',
    model: 'fictional',
  });
  await retained.done;
  expect((await retained.retrySave()).recovery?.save).toMatchObject({
    stage: 'response',
    error: 'Response unavailable',
    inProgress: false,
    allowed: true,
  });
  backend.dispose();
  nodes.close();
});

import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import { nodeOperations } from '../../vault/nodes/operations.ts';
import { readAgentRun } from '../../agent/store.ts';
import { createNodeChatBackend } from './node-backend.ts';

type Part =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Value>
    ? Value
    : never;
const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const step = (parts: Part[], reason: 'stop' | 'tool-calls' = 'stop') => ({
  stream: convertArrayToReadableStream<Part>([
    { type: 'stream-start', warnings: [] },
    ...parts,
    { type: 'finish', finishReason: { unified: reason, raw: undefined }, usage },
  ]),
});
const answer = () =>
  step([
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: 'Recorded.' },
    { type: 'text-end', id: 't' },
  ]);
const send = (id = 'send') => ({
  id,
  conversation: 'conversation',
  text: 'Keep mornings free.',
  model: 'fictional',
});
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
      instructions: 'Keep a reliable record.',
      model: async () => new MockLanguageModelV4({ doStream: [answer()] }),
      settings: { maxSteps: 3 },
    },
  };
}

test('Chat accepts message/run/context together then records attributed tool activity and response', async () => {
  const { nodes, options } = await fixture();
  const model = new MockLanguageModelV4({
    doStream: [
      step(
        [
          {
            type: 'tool-call',
            toolCallId: 'call',
            toolName: 'publish',
            input: '{"text":"Accepted content"}',
          },
        ],
        'tool-calls',
      ),
      answer(),
    ],
  });
  const backend = createNodeChatBackend({
    ...options,
    model: async () => {
      const diffs = await nodes.changes('send');
      expect(diffs.some(({ after }) => after.data?.kind === 'message')).toBe(true);
      expect(diffs.some(({ after }) => after.data?.kind === 'agentRun')).toBe(true);
      return model;
    },
    enabledTools: [{ name: 'publish' }],
    writableKinds: ['paragraph'],
    tools: (context) => ({
      publish: tool({
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }) => ({
          transaction: await context.commit({
            id: 'content',
            kind: nodeOperations.create,
            message: null,
            changes: [create('content', { kind: 'paragraph', text })],
          }),
        }),
      }),
    }),
  });
  const handle = backend.send(send());
  expect((await handle.done).phase).toBe('complete');
  const messages = await backend.messages('conversation');
  expect(messages.map(({ data }) => data.role)).toEqual(['user', 'agent']);
  expect(messages[1]?.data).toMatchObject({
    status: 'complete',
    parts: [
      { kind: 'tool', callId: 'call', status: 'complete', output: { transaction: 'content' } },
      { kind: 'text', text: 'Recorded.' },
    ],
  });
  const run = (await nodes.changes('send')).find(({ after }) => after.data?.kind === 'agentRun')!;
  expect((await readAgentRun(nodes, run.node))?.tools[0]?.data.status).toBe('complete');
  expect((await nodes.snapshot()).get('content')?.data?.text).toBe('Accepted content');
  const response = (await nodes.history()).find(({ kind }) => kind.action === 'completeResponse')!;
  expect(await nodes.changes(response.id)).toHaveLength(1);
  expect((await nodes.snapshot()).get('conversation')?.key.transaction).toBe('send');
  expect((await nodes.history()).find(({ id }) => id === 'content')).toMatchObject({
    recordedBy: 'agent',
    origin: run.node,
  });
});

test('a rejected composed acceptance publishes nothing and retry retains all prepared identities', async () => {
  const { nodes, options } = await fixture();
  let rejected = true;
  let models = 0;
  const writes: unknown[] = [];
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: (value) => {
        writes.push(value);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: caller changes injected failure after acceptance settles.
        return rejected ? Promise.reject(new Error('Offline')) : nodes.commit(value);
      },
    },
    model: () => {
      models++;
      return Promise.resolve(new MockLanguageModelV4({ doStream: [answer()] }));
    },
  });
  const handle = backend.send(send());
  const wait = new Promise<void>((resolve) => {
    handle.subscribe(() => {
      if (handle.snapshot().phase === 'unsaved') resolve();
    });
  });
  await wait;
  expect((await nodes.snapshot()).get('conversation')).toBeUndefined();
  expect(models).toBe(0);
  const original = handle.prepared();
  rejected = false;
  expect((await handle.retrySave()).phase).toBe('recorded');
  expect(writes[1]).toEqual(writes[0]);
  expect(handle.prepared()).toBe(original);
  expect(models).toBe(0);
  expect(
    (await nodes.changes('send')).filter(({ after }) => after.data?.kind === 'agentRun'),
  ).toHaveLength(1);
});

test('a failed Chat response save retries independently of completed Agent execution', async () => {
  const { nodes, options } = await fixture();
  let failed = true;
  const writes: unknown[] = [];
  const model = new MockLanguageModelV4({ doStream: [answer()] });
  const backend = createNodeChatBackend({
    ...options,
    model: async () => model,
    nodes: {
      ...nodes,
      commit: (value) => {
        if (value.kind.action === 'completeResponse') {
          writes.push(value);
          // biome-ignore lint/suspicious/noUnnecessaryConditions: caller changes injected failure after run.done.
          if (failed) return Promise.reject(new Error('Response offline'));
        }
        return nodes.commit(value);
      },
    },
  });
  const handle = backend.send(send());
  expect(await handle.done).toMatchObject({
    phase: 'unsaved',
    persistenceStage: 'response',
    response: { status: 'complete' },
  });
  expect((await backend.messages('conversation'))[1]?.data).toMatchObject({ status: 'running' });
  failed = false;
  expect((await handle.retrySave()).phase).toBe('complete');
  expect(writes[1]).toEqual(writes[0]);
  expect(model.doStreamCalls).toHaveLength(1);
  expect((await backend.messages('conversation'))[1]?.data).toMatchObject({ status: 'complete' });
});

test('opening a saved request and its tool receipts never starts another Agent run', async () => {
  const { nodes, options } = await fixture();
  const backend = createNodeChatBackend(options);
  await backend.send(send()).done;
  let models = 0;
  const reopened = createNodeChatBackend({
    ...options,
    model: () => {
      models++;
      return Promise.reject(new Error('No replay'));
    },
  });
  expect((await reopened.send(send()).done).phase).toBe('complete');
  expect(models).toBe(0);
  expect((await nodes.history()).filter(({ kind }) => kind.action === 'submit')).toHaveLength(1);
  expect((await reopened.messages('conversation'))[1]?.data).toMatchObject({
    status: 'complete',
    parts: [{ kind: 'text', text: 'Recorded.' }],
  });
});

test('later conversation context retains exact accepted messages and effective instructions', async () => {
  const { nodes, options } = await fixture();
  const backend = createNodeChatBackend(options);
  await backend.send(send()).done;
  const firstMessages = await backend.messages('conversation');
  const next = backend.send({ ...send('second'), text: 'What did I say?' });
  await next.done;
  const prepared = next.prepared()!;
  const run = await readAgentRun(nodes, prepared.execution.run);
  expect(run?.context.map(({ data }) => data.content)).toContain('Keep a reliable record.');
  expect(
    run?.context.flatMap(({ references }) =>
      references.map(({ connection }) => connection?.target),
    ),
  ).toContainEqual(firstMessages[0]!.version.key);
  expect(
    run?.context.flatMap(({ references }) =>
      references.map(({ connection }) => connection?.target),
    ),
  ).toContainEqual(firstMessages[1]!.version.key);
  expect(
    (await nodes.snapshot()).children('conversation').map(({ placement }) => placement?.order),
  ).toEqual(['a', 'aa']);
});

test('Chat orders only acceptance, allowing the next append while a previous Agent waits', async () => {
  const { nodes, options } = await fixture();
  let entered!: () => void;
  let release!: (model: MockLanguageModelV4) => void;
  const loading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<MockLanguageModelV4>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const backend = createNodeChatBackend({
    ...options,
    model: () => {
      if (calls++ === 0) {
        entered();
        return held;
      }
      return Promise.resolve(new MockLanguageModelV4({ doStream: [answer()] }));
    },
  });
  const first = backend.send(send());
  await loading;
  const second = backend.send({ ...send('second'), text: 'Another question' });
  expect((await second.done).phase).toBe('complete');
  expect(first.snapshot().phase).toBe('running');
  expect(
    (await nodes.snapshot()).children('conversation').map(({ placement }) => placement?.order),
  ).toEqual(['a', 'aa']);
  release(new MockLanguageModelV4({ doStream: [answer()] }));
  await first.done;
});

test('a queued append waits for unresolved acceptance then uses its accepted sibling order', async () => {
  const { nodes, options } = await fixture();
  let failing = true;
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: (value) =>
        value.id === 'send' && failing ? Promise.reject(new Error('Offline')) : nodes.commit(value),
    },
  });
  const first = backend.send(send());
  await new Promise<void>((resolve) => {
    first.subscribe(() => {
      if (first.snapshot().phase === 'unsaved') resolve();
    });
  });
  const second = backend.send({ ...send('second'), text: 'Second' });
  await Promise.resolve();
  expect(second.snapshot().phase).toBe('queued');
  expect(second.prepared()).toBeUndefined();
  failing = false;
  await first.retrySave();
  expect((await second.done).phase).toBe('complete');
  expect(
    (await nodes.snapshot()).children('conversation').map(({ placement }) => placement?.order),
  ).toEqual(['a', 'aa']);
});

test('recovered Agent outcome is followed by a durable Chat response without replay', async () => {
  const { nodes, options } = await fixture();
  let outcomeFails = true;
  let effects = 0;
  const model = new MockLanguageModelV4({
    doStream: [
      step(
        [{ type: 'tool-call', toolCallId: 'call', toolName: 'publish', input: '{}' }],
        'tool-calls',
      ),
      answer(),
    ],
  });
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: (value) =>
        value.kind.action === 'completeTool' && outcomeFails
          ? Promise.reject(new Error('Outcome offline'))
          : nodes.commit(value),
    },
    model: async () => model,
    enabledTools: [{ name: 'publish' }],
    tools: () => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: () => {
          effects++;
          return 'Known';
        },
      }),
    }),
  });
  const handle = backend.send(send());
  await new Promise<void>((resolve) => {
    handle.subscribe(() => {
      if (handle.snapshot().phase === 'paused') resolve();
    });
  });
  expect(handle.snapshot().persistenceStage).toBe('outcome');
  outcomeFails = false;
  await handle.retrySave();
  expect((await handle.done).phase).toBe('complete');
  expect((await backend.messages('conversation'))[1]?.data).toMatchObject({
    status: 'complete',
    parts: [
      { kind: 'tool', output: 'Known' },
      { kind: 'text', text: 'Recorded.' },
    ],
  });
  expect(effects).toBe(1);
});

test('Chat Stop preserves accepted tool results and saves its stopped response after recovery', async () => {
  const { nodes, options } = await fixture();
  let outcomeFails = true;
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: (value) =>
        value.kind.action === 'completeTool' && outcomeFails
          ? Promise.reject(new Error('Outcome offline'))
          : nodes.commit(value),
    },
    model: async () =>
      new MockLanguageModelV4({
        doStream: [
          step(
            [{ type: 'tool-call', toolCallId: 'call', toolName: 'publish', input: '{}' }],
            'tool-calls',
          ),
          answer(),
        ],
      }),
    enabledTools: [{ name: 'publish' }],
    tools: () => ({ publish: tool({ inputSchema: z.object({}), execute: () => 'Known result' }) }),
  });
  const handle = backend.send(send());
  await new Promise<void>((resolve) => {
    handle.subscribe(() => {
      if (handle.snapshot().phase === 'paused') resolve();
    });
  });
  handle.stop();
  await handle.done;
  outcomeFails = false;
  expect((await handle.retrySave()).phase).toBe('stopped');
  expect((await backend.messages('conversation'))[1]?.data).toMatchObject({
    status: 'stopped',
    parts: [{ kind: 'tool', output: 'Known result' }],
  });
});

test('a repeated failed initial retry keeps later append preparation blocked', async () => {
  const { nodes, options } = await fixture();
  let fail = true;
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: (value) =>
        value.id === 'send' && fail ? Promise.reject(new Error('Offline')) : nodes.commit(value),
    },
  });
  const first = backend.send(send());
  await new Promise<void>((resolve) => {
    first.subscribe(() => {
      if (first.snapshot().phase === 'unsaved') resolve();
    });
  });
  const second = backend.send({ ...send('second'), text: 'Second' });
  expect((await first.retrySave()).phase).toBe('unsaved');
  await Promise.resolve();
  expect(second.prepared()).toBeUndefined();
  fail = false;
  await first.retrySave();
  await second.done;
});

test('closing Chat with unresolved acceptance releases local append ownership without executing queued work', async () => {
  const { nodes, options } = await fixture();
  const backend = createNodeChatBackend({
    ...options,
    nodes: { ...nodes, commit: () => Promise.reject(new Error('Offline')) },
  });
  const first = backend.send(send());
  await new Promise<void>((resolve) => {
    first.subscribe(() => {
      if (first.snapshot().phase === 'unsaved') resolve();
    });
  });
  const second = backend.send({ ...send('second'), text: 'Queued' });
  backend.dispose();
  expect((await first.done).phase).toBe('unsaved');
  expect((await second.done).phase).toBe('stopped');
});

test('accepted tool receipts appear in later model context without replaying the historical calls', async () => {
  const { nodes, options } = await fixture();
  const firstModel = new MockLanguageModelV4({
    doStream: [
      step(
        [{ type: 'tool-call', toolCallId: 'call', toolName: 'publish', input: '{}' }],
        'tool-calls',
      ),
      answer(),
    ],
  });
  const backend = createNodeChatBackend({
    ...options,
    model: async () => firstModel,
    enabledTools: [{ name: 'publish' }],
    tools: () => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: () => ({ transaction: 'accepted-receipt' }),
      }),
    }),
  });
  await backend.send(send()).done;
  const nextModel = new MockLanguageModelV4({ doStream: [answer()] });
  const second = createNodeChatBackend({ ...options, model: async () => nextModel }).send({
    ...send('second'),
    text: 'What happened?',
  });
  await second.done;
  const { context } = (await readAgentRun(nodes, second.prepared()!.execution.run))!;
  expect(
    context.some(
      ({ data }) =>
        typeof data.content === 'object' &&
        JSON.stringify(data.content).includes('accepted-receipt'),
    ),
  ).toBe(true);
  expect(firstModel.doStreamCalls).toHaveLength(2);
  expect(nextModel.doStreamCalls).toHaveLength(1);
});

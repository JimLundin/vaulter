import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { nodeOperations } from '../../vault/nodes/operations.ts';
import { readAgentRun } from '../../agent/store.ts';
import { createNodeChatBackend } from './node-backend.ts';
import { createNodeConversation } from './node-conversation.ts';

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
test.each(['stop', 'dispose'] as const)(
  '%s during delayed Chat preparation cannot publish or execute',
  async (action) => {
    const { nodes, options } = await fixture();
    let entered!: () => void;
    const entering = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    let models = 0;
    const backend = createNodeChatBackend({
      ...options,
      nodes: {
        ...nodes,
        snapshot: async (sequence) => {
          if (first) {
            first = false;
            entered();
            await waiting;
          }
          return nodes.snapshot(sequence);
        },
      },
      model: () => {
        models++;
        return options.model();
      },
    });
    const handle = backend.send(send());
    await entering;
    if (action === 'stop') handle.stop();
    else backend.dispose();
    release();
    expect((await handle.done).phase).toBe('stopped');
    expect(models).toBe(0);
    expect((await nodes.snapshot()).get('conversation')).toBeUndefined();
  },
);
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

test.each(['lost', 'rejected'] as const)(
  'Chat retains %s content acceptance beside response saving and reconciles only the original publication',
  async (failure) => {
    const { nodes, options } = await fixture();
    let lost = true;
    let responseFails = true;
    let effects = 0;
    const writes: unknown[] = [];
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
        commit: async (value) => {
          if (value.id === 'content') {
            writes.push(value);
            if (lost && failure === 'rejected') {
              lost = false;
              throw new Error('Content response lost');
            }
            const accepted = await nodes.commit(value);
            if (lost) {
              lost = false;
              throw new Error('Content response lost');
            }
            return accepted;
          }
          if (value.kind.action === 'completeResponse' && responseFails)
            throw new Error('Response offline');
          return nodes.commit(value);
        },
      },
      model: async () => model,
      enabledTools: [{ name: 'publish' }],
      writableKinds: ['paragraph'],
      tools: (context) => ({
        publish: tool({
          inputSchema: z.object({}),
          execute: async () => {
            effects++;
            return context.commit({
              id: 'content',
              kind: nodeOperations.create,
              message: null,
              changes: [create('content', { kind: 'paragraph', text: 'Accepted once' })],
            });
          },
        }),
      }),
    });
    const handle = backend.send(send());
    expect(await handle.done).toMatchObject({
      persistenceStage: 'response',
      contentPersistence: {
        error: 'Content response lost',
        request: { id: 'content', recordedBy: 'agent' },
      },
    });
    await handle.retryContentSave();
    expect(handle.snapshot()).toMatchObject({
      persistenceStage: 'response',
      persistenceError: 'Response offline',
      contentAccepted: 'content',
    });
    expect(handle.snapshot().contentPersistence).toBeUndefined();
    expect(writes[1]).toEqual(writes[0]);
    responseFails = false;
    await handle.retrySave();
    expect((await backend.messages('conversation'))[1]?.data).toMatchObject({
      parts: [
        { kind: 'tool', status: 'failed', error: 'Content response lost' },
        { kind: 'text', text: 'Recorded.' },
      ],
    });
    expect(effects).toBe(1);
    expect(model.doStreamCalls).toHaveLength(2);
  },
);

test('the Chat controller preserves content diagnostics, blocks another Send and recovers saving without tool replay', async () => {
  const { nodes, options } = await fixture();
  let fail = true;
  let effects = 0;
  const model = new MockLanguageModelV4({
    doStream: [
      step(
        [{ type: 'tool-call', toolCallId: 'call', toolName: 'publish', input: '{}' }],
        'tool-calls',
      ),
      answer(),
      answer(),
    ],
  });
  const chat = createNodeConversation({
    ...options,
    selectedModel: 'fictional',
    nodes: {
      ...nodes,
      commit: (value) =>
        value.id === 'content' && fail
          ? Promise.reject(new Error('Content offline'))
          : nodes.commit(value),
    },
    model: async () => model,
    enabledTools: [{ name: 'publish' }],
    writableKinds: ['paragraph'],
    tools: (context) => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: () => {
          effects++;
          return context.commit({
            id: 'content',
            kind: nodeOperations.create,
            message: null,
            changes: [create('content', { kind: 'paragraph', text: 'Accepted' })],
          });
        },
      }),
    }),
  });
  await chat.send('Save this');
  expect(chat.snapshot()).toMatchObject({
    busy: false,
    contentPersistence: { error: 'Content offline' },
  });
  chat.setDraft('Next message');
  await chat.sendDraft();
  expect(chat.snapshot().draft).toBe('Next message');
  expect(model.doStreamCalls).toHaveLength(2);
  fail = false;
  await chat.retryContentSave();
  expect(chat.snapshot().contentPersistence).toBeUndefined();
  expect(chat.snapshot().contentAccepted).toBe('content');
  await chat.sendDraft();
  expect(model.doStreamCalls).toHaveLength(3);
  expect(effects).toBe(1);
  chat.dispose();
});

test('Chat retains an accepted-content context refresh error until an explicit read succeeds', async () => {
  const { nodes, options } = await fixture();
  let failRefresh = false;
  let effects = 0;
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: async (value) => {
        const accepted = await nodes.commit(value);
        if (value.id === 'content') failRefresh = true;
        return accepted;
      },
      snapshot: (sequence) => {
        if (failRefresh) {
          failRefresh = false;
          return Promise.reject(new Error('Refresh offline'));
        }
        return nodes.snapshot(sequence);
      },
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
    writableKinds: ['paragraph'],
    tools: (context) => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: async () => {
          effects++;
          return context.commit({
            id: 'content',
            kind: nodeOperations.create,
            message: null,
            changes: [create('content', { kind: 'paragraph', text: 'Accepted' })],
          });
        },
      }),
    }),
  });
  const handle = backend.send(send());
  expect(await handle.done).toMatchObject({ phase: 'complete', contextError: 'Refresh offline' });
  await handle.refreshContext();
  expect(handle.snapshot().contextError).toBeUndefined();
  expect(effects).toBe(1);
});

test.each(['response', 'terminal'] as const)(
  'reopening after %s failure reads accepted Agent receipts/output and next context retains exact sources without replay',
  async (failure) => {
    const { nodes, options } = await fixture();
    let effects = 0;
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
      nodes: {
        ...nodes,
        commit: (value) =>
          value.kind.action === (failure === 'response' ? 'completeResponse' : 'completeRun')
            ? Promise.reject(new Error('Save offline'))
            : nodes.commit(value),
      },
      model: async () => firstModel,
      enabledTools: [{ name: 'publish' }],
      tools: () => ({
        publish: tool({
          inputSchema: z.object({}),
          execute: () => {
            effects++;
            return { transaction: 'accepted-receipt' };
          },
        }),
      }),
    });
    const first = backend.send(send());
    await first.done;
    const run = (await readAgentRun(nodes, first.prepared()!.execution.run))!;
    if (failure === 'terminal') {
      const message = first
        .prepared()!
        .submission.changes.find((change) => change.data?.role === 'agent')!;
      await nodes.commit(
        request('checkpoint', [
          await revise(nodes, message.node, {
            ...message.data!,
            parts: [
              {
                kind: 'tool',
                callId: 'call',
                name: 'publish',
                input: {},
                status: 'running',
                future: { kept: true },
              },
            ],
          }),
        ]),
      );
    }
    const before = (await nodes.history()).length;
    let modelLoads = 0;
    const nextModel = new MockLanguageModelV4({ doStream: [answer()] });
    const reopened = createNodeChatBackend({
      ...options,
      model: async () => {
        modelLoads++;
        return nextModel;
      },
    });
    const messages = await reopened.messages('conversation');
    expect(messages[1]?.data).toMatchObject({
      status: 'running',
      parts: expect.arrayContaining([
        expect.objectContaining({
          kind: 'tool',
          callId: 'call',
          name: 'publish',
          input: {},
          status: 'complete',
          output: { transaction: 'accepted-receipt' },
        }),
      ]),
    });
    if (failure === 'response')
      expect(messages[1]?.data).toMatchObject({
        parts: expect.arrayContaining([{ kind: 'text', text: 'Recorded.' }]),
      });
    const originalMessage = (await nodes.snapshot()).get(messages[1]!.version.key.node)!;
    expect(originalMessage.data).toMatchObject({
      status: 'running',
      parts: failure === 'response' ? [] : [{ status: 'running' }],
    });
    if (failure === 'terminal')
      expect(messages[1]?.data).toMatchObject({ parts: [{ future: { kept: true } }] });
    expect((await reopened.send(send()).done).phase).toBe('recorded');
    expect(modelLoads).toBe(0);
    expect((await nodes.history()).length).toBe(before);
    const next = reopened.send({ ...send('second'), text: 'What was accepted?' });
    await next.done;
    const context = (await readAgentRun(nodes, next.prepared()!.execution.run))!.context;
    expect(
      context.some(({ data }) => JSON.stringify(data.content).includes('accepted-receipt')),
    ).toBe(true);
    const targets = context.flatMap(({ references }) =>
      references.map(({ connection }) => connection?.target),
    );
    expect(targets).toContainEqual(run.tools[0]!.version.key);
    if (failure === 'response') expect(targets).toContainEqual(run.version.key);
    expect(effects).toBe(1);
    expect(firstModel.doStreamCalls).toHaveLength(2);
    expect(modelLoads).toBe(1);
  },
);

test('reopening a running invocation retains uncertainty and supplies its exact receipt without replay', async () => {
  const { nodes, options } = await fixture();
  let effects = 0;
  const backend = createNodeChatBackend({
    ...options,
    nodes: {
      ...nodes,
      commit: (value) =>
        value.kind.action === 'completeTool'
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
    tools: () => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: () => {
          effects++;
          return 'Known only to the live owner';
        },
      }),
    }),
  });
  const first = backend.send(send());
  await new Promise<void>((resolve) => {
    first.subscribe(() => {
      if (first.snapshot().phase === 'paused') resolve();
    });
  });
  first.stop();
  await first.done;
  const run = (await readAgentRun(nodes, first.prepared()!.execution.run))!;
  const reopened = createNodeChatBackend(options);
  const messages = await reopened.messages('conversation');
  expect(messages[1]?.data).toMatchObject({
    status: 'running',
    parts: [{ kind: 'tool', callId: 'call', status: 'running' }],
  });
  const next = reopened.send({ ...send('second'), text: 'Inspect the existing work' });
  await next.done;
  const context = (await readAgentRun(nodes, next.prepared()!.execution.run))!.context;
  expect(
    context.some(({ data }) =>
      JSON.stringify(data.content).includes('Outcome is uncertain; do not repeat this tool.'),
    ),
  ).toBe(true);
  expect(
    context.flatMap(({ references }) => references.map(({ connection }) => connection?.target)),
  ).toContainEqual(run.tools[0]!.version.key);
  expect(effects).toBe(1);
  backend.dispose();
  reopened.dispose();
});

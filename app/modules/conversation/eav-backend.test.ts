import { expect, test, vi } from 'vitest';
import {
  ConflictError,
  openDatabase,
  createMemoryStorage,
  createPersistentStorage,
  type Journal,
  type AppendRequest,
} from '@/core/store/index.ts';
import { createEavChatBackend } from './eav-backend.ts';
import { chatSchema } from './records.ts';
import type { AgentExecutionProvider } from '@/modules/agent/providers.ts';

async function setup(storage = createMemoryStorage(), execute?: AgentExecutionProvider) {
  const db = await openDatabase({ schema: chatSchema, storage });
  const execution = vi.fn(
    execute ?? (async () => ({ status: 'complete' as const, text: 'Hello back' })),
  );
  const options = {
    database: Promise.resolve(db),
    user: 'user',
    agent: 'agent',
    provider: 'test',
    instructions: 'Be helpful',
    execution,
  };
  return { db, execution, options, backend: createEavChatBackend(options) };
}
const send = { id: 'send', text: 'Hello', model: 'test' };

test('live chat records EAV, restores history and never executes a restored submission', async () => {
  const { db, execution, options, backend } = await setup();
  await using _db = db;
  expect(await backend.send(send).done).toMatchObject({ phase: 'complete' });
  expect(execution).toHaveBeenCalledOnce();
  expect(await backend.messages()).toMatchObject([
    { data: { role: 'user', text: 'Hello' } },
    { data: { role: 'agent', parts: [{ kind: 'text', text: 'Hello back' }], status: 'complete' } },
  ]);
  expect(await db.entities.messages.query({ select: {} })).toHaveLength(1);
  const reopened = createEavChatBackend(options);
  expect((await reopened.send(send).done).phase).toBe('complete');
  expect(execution).toHaveBeenCalledOnce();
  backend.dispose();
  reopened.dispose();
});

test('initial and terminal save recovery does not repeat execution', async () => {
  let journal: Journal = { commits: [], schemas: [] };
  let failure = 'initial';
  const storage = createPersistentStorage({
    scope: 'chat-test',
    load: async () => journal,
    append: async (request: AppendRequest) => {
      const response = request.commit.facts.some(
        (fact) => fact.attribute === 'agent.run/status' && fact.value === 'running' && !fact.added,
      );
      if (
        (failure === 'initial' &&
          request.commit.facts.some((fact) => fact.attribute === 'chat.exchange/submission')) ||
        (failure === 'terminal' && response)
      )
        throw new Error('Save failed');
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
    },
  });
  const { db, execution, backend } = await setup(storage);
  await using _db = db;
  const first = backend.send(send);
  expect(await first.done).toMatchObject({ persistenceStage: 'initial' });
  expect(execution).not.toHaveBeenCalled();
  failure = '';
  expect((await first.retrySave()).phase).toBe('recorded');
  expect(execution).not.toHaveBeenCalled();
  const second = backend.send({ ...send, id: 'next' });
  // Accept the next submission, then fail only its response completion.
  failure = 'terminal';
  const result = await second.done;
  expect(result.persistenceStage).toBe('terminal');
  expect(execution).toHaveBeenCalledOnce();
  failure = '';
  expect((await second.retrySave()).phase).toBe('complete');
  expect(execution).toHaveBeenCalledOnce();
  backend.dispose();
});

test.each([
  ['invocation', 'save'],
  ['outcome', 'save'],
  ['invocation', 'conflict'],
  ['outcome', 'conflict'],
] as const)(
  'Stop retains %s recovery after %s failure without replaying a tool',
  async (stage, failure) => {
    let journal: Journal = { commits: [], schemas: [] };
    let fail = true;
    const storage = createPersistentStorage({
      scope: `tool-${stage}`,
      load: async () => journal,
      append: async (value) => {
        const matches = value.commit.facts.some(
          (fact) =>
            fact.attribute === 'agent.toolExecution/status' &&
            fact.value === 'running' &&
            fact.added === (stage === 'invocation'),
        );
        if (fail && matches)
          throw failure === 'conflict' ? new ConflictError() : new Error('Tool save failed');
        journal = { schemas: value.schemas, commits: [...journal.commits, value.commit] };
      },
    });
    const effect = vi.fn(async () => ({ answer: 42 }));
    const { db, options } = await setup(storage, async ({ tools, signal }) => {
      await Reflect.apply(tools.echo!.execute!, undefined, [
        {},
        { toolCallId: 'call', messages: [], abortSignal: signal },
      ]);
      return { status: 'complete', text: 'Done' };
    });
    await using _db = db;
    const { z } = await import('zod');
    const backend = createEavChatBackend({
      ...options,
      enabledTools: [{ name: 'echo', version: '1' }],
      tools: () => ({ echo: { inputSchema: z.object({}), execute: effect } }),
    });
    const handle = backend.send(send);
    await vi.waitFor(() => expect(handle.snapshot().persistenceStage).toBe(stage));
    handle.stop();
    await handle.done;
    expect(effect).toHaveBeenCalledTimes(stage === 'invocation' ? 0 : 1);
    fail = false;
    await handle.retrySave();
    expect(handle.snapshot().persistenceError).toBeUndefined();
    expect(effect).toHaveBeenCalledTimes(stage === 'invocation' ? 0 : 1);
    expect(await db.entities.toolExecutions.first({ select: { status: true } })).toMatchObject({
      status: stage === 'invocation' ? 'cancelled' : 'complete',
    });
    expect(await db.entities.agentRuns.first({ select: { status: true } })).toMatchObject({
      status: stage === 'invocation' ? 'interrupted' : 'stopped',
    });
    backend.dispose();
  },
);

test('concurrent submission recovery restores the winner without creating or executing another run', async () => {
  const { db, options, execution, backend } = await setup();
  await using _db = db;
  const second = createEavChatBackend(options);
  const handles = [backend.send(send), second.send(send)];
  const results = await Promise.all(handles.map((handle) => handle.done));
  expect(results.some((result) => result.phase === 'complete')).toBe(true);
  for (const handle of handles) {
    if (handle.snapshot().phase === 'unsaved') await handle.retrySave();
    expect(handle.snapshot().phase).toBe('complete');
  }
  expect(
    await db.entities.exchanges.query({ where: { submission: { eq: send.id } }, select: {} }),
  ).toHaveLength(1);
  expect(await db.entities.agentRuns.query({ select: {} })).toHaveLength(1);
  expect(execution).toHaveBeenCalledOnce();
  backend.dispose();
  second.dispose();
});

test('terminal recovery after another accepted write retains the result without repeating the provider', async () => {
  let journal: Journal = { commits: [], schemas: [] };
  let fail = true;
  const storage = createPersistentStorage({
    scope: 'terminal-conflict',
    load: async () => journal,
    append: async (value) => {
      if (
        fail &&
        value.commit.facts.some(
          (fact) =>
            fact.attribute === 'agent.run/status' && !fact.added && fact.value === 'running',
        )
      )
        throw new Error('Terminal save failed');
      journal = { schemas: value.schemas, commits: [...journal.commits, value.commit] };
    },
  });
  const { db, execution, backend } = await setup(storage);
  await using _db = db;
  const handle = backend.send(send);
  expect(await handle.done).toMatchObject({ phase: 'unsaved', persistenceStage: 'terminal' });
  fail = false;
  await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Another actor', kind: 'system' }),
  );
  await handle.retrySave();
  expect(handle.snapshot()).toMatchObject({ phase: 'complete', response: { status: 'complete' } });
  expect(handle.snapshot().persistenceError).toBeUndefined();
  expect(execution).toHaveBeenCalledOnce();
  expect(await backend.messages()).toMatchObject([
    { data: { role: 'user', text: 'Hello' } },
    { data: { role: 'agent', parts: [{ kind: 'text', text: 'Hello back' }] } },
  ]);
  backend.dispose();
});

test('different topics continue the same dialogue after reopening', async () => {
  const { db, options, backend, execution } = await setup();
  await using _db = db;
  await backend.send(send).done;
  const reopened = createEavChatBackend(options);
  await reopened.send({
    ...send,
    id: 'other',
    text: 'Another subject',
  }).done;
  expect(execution.mock.calls[1]?.[0]?.messages).toEqual(
    expect.arrayContaining([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hello back' },
    ]),
  );
  expect(await db.entities.conversations.query({ select: {} })).toHaveLength(1);
  expect(await reopened.messages()).toHaveLength(4);
  expect(await db.entities.messages.query({ select: {} })).toHaveLength(2);
  backend.dispose();
  reopened.dispose();
});

test('text requests retain each effective input and response and render text/tool order from Agent records', async () => {
  const { MockLanguageModelV4, convertArrayToReadableStream } = await import('ai/test');
  const { z } = await import('zod');
  const { db, options } = await setup();
  await using _db = db;
  let calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const position = calls++;
      expect(
        await db.entities.modelSteps.first({
          where: { position: { eq: position } },
          select: { status: true },
        }),
      ).toMatchObject({ status: 'running' });
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: position ? 'Done' : 'Looking' },
          { type: 'text-end', id: 'text' },
          ...(!position
            ? [{ type: 'tool-call' as const, toolCallId: 'call', toolName: 'echo', input: '{}' }]
            : []),
          {
            type: 'finish',
            finishReason: { unified: position ? 'stop' : 'tool-calls', raw: undefined },
            usage: {
              inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 2, text: 2, reasoning: 0 },
            },
          },
        ]),
      };
    },
  });
  const effect = vi.fn(async () => ({ answer: 42 }));
  const backend = createEavChatBackend({
    ...options,
    execution: undefined,
    model: async () => model,
    settings: { maxSteps: 3 },
    enabledTools: [{ name: 'echo', version: '1' }],
    tools: () => ({ echo: { inputSchema: z.object({}), execute: effect } }),
  });
  expect(await backend.send(send).done).toMatchObject({ phase: 'complete' });
  expect(calls).toBe(2);
  expect(effect).toHaveBeenCalledOnce();
  const steps = await db.entities.modelSteps.query({
    select: { status: true, input: true },
    orderBy: [{ position: 'asc' }],
  });
  expect(steps).toHaveLength(2);
  expect(steps.every((step) => step.status === 'complete')).toBe(true);
  expect(JSON.stringify(steps[1]?.input)).toContain('42');
  expect(
    await db.entities.toolExecutions.first({ select: { step: { position: true } } }),
  ).toMatchObject({ step: { position: 0 } });
  const transcript = await backend.messages();
  const response = transcript.at(-1)?.data;
  if (response?.role !== 'agent') throw new Error('Missing Agent response');
  expect(response.parts.map((part) => part.kind)).toEqual(['text', 'tool', 'text']);
  expect(await db.entities.messages.query({ select: {} })).toHaveLength(1);
  backend.dispose();
});

test.each(['request', 'response'])(
  'recovering a model-step %s save never repeats a provider request',
  async (stage) => {
    const { MockLanguageModelV4, convertArrayToReadableStream } = await import('ai/test');
    let journal: Journal = { commits: [], schemas: [] };
    let fail = true;
    const storage = createPersistentStorage({
      scope: `step-${stage}`,
      load: async () => journal,
      append: async (value) => {
        if (
          fail &&
          value.commit.facts.some(
            (fact) =>
              fact.attribute === 'agent.modelStep/status' &&
              fact.value === 'running' &&
              fact.added === (stage === 'request'),
          )
        )
          throw new Error('Step save failed');
        journal = { schemas: value.schemas, commits: [...journal.commits, value.commit] };
      },
    });
    const { db, options } = await setup(storage);
    await using _db = db;
    const call = vi.fn(async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        { type: 'text-start' as const, id: 'text' },
        { type: 'text-delta' as const, id: 'text', delta: 'Retained result' },
        { type: 'text-end' as const, id: 'text' },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: {
            inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
        },
      ]),
    }));
    const backend = createEavChatBackend({
      ...options,
      execution: undefined,
      model: async () => new MockLanguageModelV4({ doStream: call }),
    });
    const handle = backend.send(send);
    expect(await handle.done).toMatchObject({ phase: 'unsaved' });
    fail = false;
    await handle.retrySave();
    expect(handle.snapshot().persistenceError).toBeUndefined();
    expect(call).toHaveBeenCalledTimes(stage === 'request' ? 0 : 1);
    expect(await db.entities.modelSteps.first({ select: { status: true } })).toMatchObject({
      status: stage === 'request' ? 'stopped' : 'complete',
    });
    backend.dispose();
  },
);

test('timeline checkpoints retain history while new runs receive summary plus subsequent activity', async () => {
  const observed: string[] = [];
  const { db, backend, execution } = await setup(createMemoryStorage(), async (input) => {
    if (input.instructions.some((item) => item.content.includes('Create a context checkpoint')))
      return {
        status: 'complete',
        text: 'Garden plans\nWe decided to put the bench beside the garden wall. Still need dimensions.',
      };
    observed.push(JSON.stringify(input.messages));
    return { status: 'complete', text: 'Recorded reply' };
  });
  await using _db = db;
  await backend.send({ ...send, text: 'Put the bench beside the garden wall' }).done;
  const checkpoint = backend.checkpoint!('test');
  await checkpoint.done;
  expect(checkpoint.snapshot()).toEqual({ phase: 'complete' });
  const timeline = await backend.timeline!();
  expect(timeline).toMatchObject([{ anchor: 0, checkpoints: [{ title: 'Garden plans' }] }]);
  const calls = execution.mock.calls.length;
  expect(await backend.timeline!()).toHaveLength(1);
  expect(await backend.messages()).toHaveLength(2);
  expect(execution.mock.calls).toHaveLength(calls);
  await backend.send({ ...send, id: 'dimensions', text: 'It should be two metres wide' }).done;
  await backend.send({ ...send, id: 'continue', text: 'What next?' }).done;
  expect(observed[1]).toContain('Still need dimensions');
  expect(observed[1]).not.toContain('Put the bench beside');
  expect(observed[2]).toContain('Still need dimensions');
  expect(observed[2]).toContain('It should be two metres wide');
  const contexts = await db.entities.runContexts.query({
    select: { checkpoint: true, exchanges: true },
  });
  expect(contexts.map((context) => context.exchanges.length).sort()).toEqual([0, 0, 1]);
  expect(contexts.filter((context) => context.checkpoint)).toHaveLength(2);
  expect(await backend.messages()).toHaveLength(6);
  expect((await backend.timeline!()).map((entry) => entry.anchor)).toEqual([0, 2, 4]);
  checkpoint.dispose();
  backend.dispose();
});

test('changed source evidence invalidates a checkpoint without removing it from the timeline', async () => {
  const { db, backend, execution } = await setup(createMemoryStorage(), async (input) => ({
    status: 'complete',
    text: input.instructions.some((item) => item.content.includes('Create a context checkpoint'))
      ? 'Old summary\nThe old evidence.'
      : 'Original evidence',
  }));
  await using _db = db;
  await backend.send(send).done;
  const checkpoint = backend.checkpoint!('test');
  await checkpoint.done;
  const exchange = await db.entities.exchanges.first({ select: { run: true } });
  await db.transaction(async (tx) => {
    await tx.entities.agentRuns.update({
      ...exchange!.run!,
      output: { text: 'Corrected evidence' },
    });
  });
  await backend.send({ ...send, id: 'next' }).done;
  const input = JSON.stringify(execution.mock.calls.at(-1)![0]!.messages);
  expect(input).toContain('Corrected evidence');
  expect(input).not.toContain('The old evidence.');
  expect((await backend.timeline!())[0].checkpoints).toHaveLength(1);
  checkpoint.dispose();
  backend.dispose();
});

test('checkpoint publication retry saves the retained summary without another provider request', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  let fail = true;
  const storage = createPersistentStorage({
    scope: 'checkpoint-retry',
    load: async () => journal,
    append: async (request) => {
      if (
        fail &&
        request.commit.facts.some((fact) => fact.attribute === 'chat.contextCheckpoint/summary')
      )
        throw new Error('Checkpoint publication unavailable');
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
    },
  });
  const { db, backend, execution } = await setup(storage);
  await using _db = db;
  await backend.send(send).done;
  const checkpoint = backend.checkpoint!('test');
  await checkpoint.done;
  expect(checkpoint.snapshot()).toMatchObject({ phase: 'unsaved', retryable: true });
  expect((await backend.timeline!())[0].checkpoints).toHaveLength(0);
  fail = false;
  await checkpoint.retry();
  expect(checkpoint.snapshot()).toEqual({ phase: 'complete' });
  expect(execution).toHaveBeenCalledTimes(2);
  expect((await backend.timeline!())[0].checkpoints).toHaveLength(1);
  checkpoint.dispose();
  backend.dispose();
});

test('the history tool retrieves original passages omitted from a checkpoint and records the read', async () => {
  let calls = 0;
  let retrieved: unknown;
  const { db, backend } = await setup(
    createMemoryStorage(),
    async ({ tools, signal, instructions }) => {
      if (instructions.some((item) => item.content.includes('Create a context checkpoint')))
        return { status: 'complete', text: 'Short context\nA plan was discussed.' };
      if (calls++ > 0)
        retrieved = await Reflect.apply(tools.readConversationHistory!.execute!, undefined, [
          { from: 0, limit: 1 },
          { toolCallId: 'retrieve', messages: [], abortSignal: signal },
        ]);
      return { status: 'complete', text: 'Done' };
    },
  );
  await using _db = db;
  await backend.send({ ...send, text: 'The precise measurement is 187 centimetres' }).done;
  const checkpoint = backend.checkpoint!('test');
  await checkpoint.done;
  await backend.send({ ...send, id: 'retrieve', text: 'What was the precise measurement?' }).done;
  expect(retrieved).toMatchObject({
    activity: [
      {
        position: 0,
        messages: [{ text: 'The precise measurement is 187 centimetres' }, { role: 'agent' }],
      },
    ],
    next: 1,
  });
  expect(
    await db.entities.toolExecutions.first({ select: { status: true, tool: { name: true } } }),
  ).toMatchObject({ status: 'complete', tool: { name: 'readConversationHistory' } });
  expect(calls).toBe(2);
  checkpoint.dispose();
  backend.dispose();
});

test('stopping checkpoint generation retains a stopped run without publishing a partial summary', async () => {
  let generating = false;
  const { db, backend } = await setup(createMemoryStorage(), async ({ instructions, signal }) => {
    if (!instructions.some((item) => item.content.includes('Create a context checkpoint')))
      return { status: 'complete', text: 'Retained reply' };
    generating = true;
    return new Promise((resolve) =>
      signal.addEventListener(
        'abort',
        () => resolve({ status: 'stopped', text: 'Partial summary' }),
        { once: true },
      ),
    );
  });
  await using _db = db;
  await backend.send(send).done;
  const checkpoint = backend.checkpoint!('test');
  await vi.waitFor(() => expect(generating).toBe(true));
  checkpoint.stop();
  await checkpoint.done;
  expect(checkpoint.snapshot()).toMatchObject({ phase: 'stopped' });
  expect((await backend.timeline!())[0].checkpoints).toHaveLength(0);
  expect(
    (await db.entities.agentRuns.query({ select: { status: true } }))
      .map((run) => run.status)
      .sort(),
  ).toEqual(['complete', 'stopped']);
  checkpoint.dispose();
  backend.dispose();
});

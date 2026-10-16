import { expect, test, vi } from 'vitest';
import {
  ConflictError,
  openDatabase,
  createMemoryStorage,
  createPersistentStorage,
  type Journal,
  type AppendRequest,
} from '../../vault/eav/index.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { seed, create, request } from '../../vault/nodes/fixtures.test-support.ts';
import { transactionFixture } from '../../vault/transactions/fixtures.test-support.ts';
import { createEavChatBackend } from './eav-backend.ts';
import { chatSchema } from './data/schema.ts';
import type { AgentExecutionProvider } from '../../agent/providers.ts';

async function setup(storage = createMemoryStorage(), execute?: AgentExecutionProvider) {
  const raw = memoryNodeBackend();
  await seed(raw);
  await raw.commit(request('agent', [create('agent', { kind: 'agent', name: 'Assistant' })]));
  const db = await openDatabase({ schema: chatSchema, storage });
  const execution = vi.fn(
    execute ?? (async () => ({ status: 'complete' as const, text: 'Hello back' })),
  );
  const options = {
    nodes: transactionFixture(raw),
    database: Promise.resolve(db),
    user: 'user',
    agent: 'agent',
    provider: 'test',
    instructions: 'Be helpful',
    execution,
  };
  return { raw, db, execution, options, backend: createEavChatBackend(options) };
}
const send = { id: 'send', conversation: 'chat', text: 'Hello', model: 'test' };

test('live chat records EAV, restores history and never executes a restored submission', async () => {
  const { raw, db, execution, options, backend } = await setup();
  await using _db = db;
  expect(await backend.send(send).done).toMatchObject({ phase: 'complete' });
  expect(execution).toHaveBeenCalledOnce();
  expect(await backend.messages('chat')).toMatchObject([
    { data: { role: 'user', text: 'Hello' } },
    { data: { role: 'agent', parts: [{ kind: 'text', text: 'Hello back' }], status: 'complete' } },
  ]);
  expect(await backend.chats()).toMatchObject([{ node: 'chat', data: { title: 'Hello' } }]);
  const roots = (await raw.snapshot()).roots();
  expect(
    roots.some((node) =>
      ['conversation', 'exchange', 'message', 'agentRun', 'toolExecution'].includes(
        String(node.data?.kind),
      ),
    ),
  ).toBe(false);
  const reopened = createEavChatBackend(options);
  expect((await reopened.send(send).done).phase).toBe('complete');
  expect(execution).toHaveBeenCalledOnce();
  backend.dispose();
  reopened.dispose();
});

test('initial and response save recovery does not repeat execution', async () => {
  let journal: Journal = { commits: [], schemas: [] };
  let failure = 'initial';
  const storage = createPersistentStorage({
    scope: 'chat-test',
    load: async () => journal,
    append: async (request: AppendRequest) => {
      const response = request.commit.facts.some(
        (fact) =>
          fact.attribute === 'chat.message/status' && fact.value === 'running' && !fact.added,
      );
      if (failure === 'initial' || (failure === 'response' && response))
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
  failure = 'response';
  const result = await second.done;
  expect(result.persistenceStage).toBe('response');
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

test('continues a legacy conversation with EAV exchanges while retaining title and prior context', async () => {
  const { raw, db, backend, execution } = await setup();
  await using _db = db;
  await raw.commit(
    request('old-chat', [
      create('chat', {
        kind: 'conversation',
        title: 'Original subject',
        createdAt: '2026-01-01T00:00:00Z',
      }),
      create('old-exchange', { kind: 'exchange', startedAt: '2026-01-01T00:00:00Z' }, 'chat'),
      create(
        'old-message',
        {
          kind: 'message',
          role: 'user',
          text: 'Remember the earlier discussion',
          at: '2026-01-01T00:00:00Z',
        },
        'old-exchange',
      ),
    ]),
  );
  expect((await backend.send(send).done).phase).toBe('complete');
  expect(execution.mock.calls[0]?.[0]?.messages).toEqual(
    expect.arrayContaining([{ role: 'user', content: 'Remember the earlier discussion' }]),
  );
  expect(await backend.messages('chat')).toHaveLength(3);
  expect(await backend.chats()).toMatchObject([{ data: { title: 'Original subject' } }]);
  const old = (await raw.snapshot()).get('old-message');
  expect(old?.key.transaction).toBe('old-chat');
  const { chatSources } = await import('./records/sources.ts');
  const view = await raw.snapshot();
  expect(chatSources().exactText?.(view.get('eav-message:send:user')!, view)).toBe('Hello');
  expect(chatSources().exactText?.(view.get('eav-message:send:agent')!, view)).toBe('Hello back');
  backend.dispose();
});

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
  expect(await db.entities.submissions.query({ select: {} })).toHaveLength(1);
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
  expect(await backend.messages('chat')).toMatchObject([
    { data: { role: 'user', text: 'Hello' } },
    { data: { role: 'agent', parts: [{ kind: 'text', text: 'Hello back' }] } },
  ]);
  backend.dispose();
});

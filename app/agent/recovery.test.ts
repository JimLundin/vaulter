import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request, seed } from '../vault/nodes/fixtures.test-support.ts';
import { nodeOperations } from '../vault/nodes/operations.ts';
import { prepareAgentRun, readAgentRun } from './store.ts';
import { createAgentBackend } from './runtime.ts';
import type { AgentRun, AgentRunState } from './runtime.ts';

type ModelPart =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Part>
    ? Part
    : never;
const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const step = (parts: ModelPart[], reason: 'stop' | 'tool-calls' = 'stop') => ({
  stream: convertArrayToReadableStream<ModelPart>([
    { type: 'stream-start', warnings: [] },
    ...parts,
    { type: 'finish', finishReason: { unified: reason, raw: undefined }, usage },
  ]),
});
const call = (name: string, id: string) =>
  step([{ type: 'tool-call', toolCallId: id, toolName: name, input: '{}' }], 'tool-calls');
const answer = () =>
  step([
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: 'Recovered.' },
    { type: 'text-end', id: 't' },
  ]);
const waitFor = (handle: AgentRun, predicate: (state: AgentRunState) => boolean) =>
  predicate(handle.snapshot())
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const unsubscribe = handle.subscribe(() => {
          if (predicate(handle.snapshot())) {
            unsubscribe();
            resolve();
          }
        });
      });
async function fixture() {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  const prepared = await prepareAgentRun(nodes, {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-10T12:00:00Z',
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 3 },
    enabledTools: [{ name: 'first' }, { name: 'later' }],
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Do work.',
        },
      },
    ],
  });
  return { nodes, prepared };
}

test('retry saves a retained successful outcome during pause and resumes without repeating effects', async () => {
  const { nodes, prepared } = await fixture();
  let failing = true;
  let effects = 0;
  let later = 0;
  const saves: unknown[] = [];
  const model = new MockLanguageModelV4({
    doStream: [call('first', 'first'), call('later', 'later'), answer()],
  });
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeTool') {
          saves.push(value);
          // biome-ignore lint/suspicious/noUnnecessaryConditions: caller changes injected transport state after pause.
          if (failing) throw new Error('Offline');
        }
        return await nodes.commit(value);
      },
    },
    model: async () => model,
    tools: () => ({
      first: tool({
        inputSchema: z.object({}),
        execute: () => {
          effects++;
          return { published: true };
        },
      }),
      later: tool({
        inputSchema: z.object({}),
        execute: () => {
          later++;
          return 'Later';
        },
      }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  const retained = handle.snapshot().pendingTool;
  expect(retained?.execution.output).toEqual({ published: true });
  failing = false;
  await handle.retrySave();
  expect((await handle.done).phase).toBe('complete');
  expect(effects).toBe(1);
  expect(later).toBe(1);
  expect(saves[1]).toEqual(saves[0]);
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('complete');
});

test('a failed tool outcome is saved and reported honestly after recovery without a repeated attempt', async () => {
  const { nodes, prepared } = await fixture();
  let failing = true;
  let executions = 0;
  const model = new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] });
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeTool' && failing) throw new Error('Outcome offline');
        return await nodes.commit(value);
      },
    },
    model: async () => model,
    tools: () => ({
      first: tool({
        inputSchema: z.object({}),
        execute: (): string => {
          executions++;
          throw new Error('Operation rejected');
        },
      }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  expect(handle.snapshot()).toMatchObject({
    persistenceStage: 'outcome',
    pendingTool: { execution: { status: 'failed', error: { message: 'Operation rejected' } } },
  });
  failing = false;
  await handle.retrySave();
  expect((await handle.done).phase).toBe('complete');
  expect(executions).toBe(1);
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data).toMatchObject({
    status: 'failed',
    error: { message: 'Operation rejected' },
  });
});

test('Stop retains a pending completed outcome and retry saves it before recording stopped without later effects', async () => {
  const { nodes, prepared } = await fixture();
  let failing = true;
  let later = 0;
  const model = new MockLanguageModelV4({
    doStream: [call('first', 'first'), call('later', 'later'), answer()],
  });
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeTool' && failing) throw new Error('Offline');
        return await nodes.commit(value);
      },
    },
    model: async () => model,
    writableKinds: ['paragraph'],
    tools: (context) => ({
      first: tool({
        inputSchema: z.object({}),
        execute: async () => ({
          transaction: await context.commit({
            id: 'content',
            kind: nodeOperations.create,
            message: null,
            changes: [create('content', { kind: 'paragraph', text: 'Accepted' })],
          }),
        }),
      }),
      later: tool({
        inputSchema: z.object({}),
        execute: () => {
          later++;
          return 'Later';
        },
      }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  const pending = handle.snapshot().pendingTool;
  handle.stop();
  expect((await handle.done).phase).toBe('paused');
  expect(handle.snapshot().data.status).toBe('stopped');
  expect(handle.snapshot().pendingTool).toEqual(pending);
  expect((await nodes.snapshot()).get('content')?.data?.text).toBe('Accepted');
  failing = false;
  expect((await handle.retrySave()).phase).toBe('stopped');
  expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('stopped');
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data).toMatchObject({
    status: 'complete',
    output: { transaction: 'content' },
  });
  expect(later).toBe(0);
  expect(model.doStreamCalls).toHaveLength(1);
});

test('lost outcome acceptance reuses the immutable receipt and never repeats content', async () => {
  const { nodes, prepared } = await fixture();
  let lost = true;
  let executions = 0;
  const writes: unknown[] = [];
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        const accepted = await nodes.commit(value);
        if (value.kind.action === 'completeTool') {
          writes.push(value);
          if (lost) {
            lost = false;
            throw new Error('Lost response');
          }
        }
        return accepted;
      },
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    tools: () => ({
      first: tool({
        inputSchema: z.object({}),
        execute: () => {
          executions++;
          return { result: 'Done' };
        },
      }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('complete');
  const retained = handle.snapshot().pendingTool!;
  expect(Object.isFrozen(retained.request)).toBe(true);
  const changed = { ...retained.request, message: 'Different saved identity' };
  await expect(nodes.commit(changed)).rejects.toThrow();
  await handle.retrySave();
  expect((await handle.done).phase).toBe('complete');
  expect(writes[1]).toEqual(writes[0]);
  expect(executions).toBe(1);
});

test('Stop drains entered publication and retains its known result while queued context writes expire', async () => {
  const { nodes, prepared } = await fixture();
  let entered!: () => void;
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let queued: Promise<string> | undefined;
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.id === 'content') {
          entered();
          await hold;
        }
        return await nodes.commit(value);
      },
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    writableKinds: ['paragraph'],
    tools: (context) => ({
      first: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const accepted = context.commit({
            id: 'content',
            kind: nodeOperations.create,
            message: null,
            changes: [create('content', { kind: 'paragraph', text: 'Accepted during Stop' })],
          });
          queued = context.commit({
            id: 'queued',
            kind: nodeOperations.create,
            message: null,
            changes: [create('queued', { kind: 'paragraph', text: 'Must not publish' })],
          });
          queued.catch(() => undefined);
          return { transaction: await accepted };
        },
      }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await writing;
  let settled = false;
  handle.done.then(
    () => {
      settled = true;
    },
    () => undefined,
  );
  handle.stop();
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  expect((await handle.done).phase).toBe('stopped');
  await expect(queued).rejects.toThrow();
  expect((await nodes.snapshot()).get('queued')).toBeUndefined();
  expect((await nodes.snapshot()).get('content')?.data?.text).toBe('Accepted during Stop');
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data).toMatchObject({
    status: 'complete',
    output: { transaction: 'content' },
  });
});

test('an invocation whose save response was lost retries persistence without starting the tool', async () => {
  const { nodes, prepared } = await fixture();
  let lost = true;
  let effects = 0;
  const model = new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] });
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        const accepted = await nodes.commit(value);
        if (value.kind.action === 'recordTool' && lost) {
          lost = false;
          throw new Error('Lost invocation receipt');
        }
        return accepted;
      },
    },
    model: async () => model,
    tools: () => ({
      first: tool({
        inputSchema: z.object({}),
        execute: () => {
          effects++;
          return 'Effect';
        },
      }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  expect(handle.snapshot().persistenceStage).toBe('invocation');
  await handle.retrySave();
  expect((await handle.done).phase).toBe('interrupted');
  expect(effects).toBe(0);
  const recorded = await readAgentRun(nodes, 'run');
  expect(recorded?.tools[0]?.data.status).toBe('running');
  const reopened = createAgentBackend({
    nodes,
    model: () => Promise.reject(new Error('No replay')),
  });
  expect((await reopened.start(prepared).done).phase).toBe('interrupted');
  expect(effects).toBe(0);
});

test('content acceptance is not reported as failure when refreshing its read snapshot fails', async () => {
  const { nodes, prepared } = await fixture();
  let refreshFails = false;
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      snapshot: (sequence) =>
        refreshFails ? Promise.reject(new Error('Snapshot unavailable')) : nodes.snapshot(sequence),
      commit: async (value) => {
        const accepted = await nodes.commit(value);
        if (value.id === 'content') refreshFails = true;
        return accepted;
      },
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    writableKinds: ['paragraph'],
    tools: (context) => ({
      first: tool({
        inputSchema: z.object({}),
        execute: async () => ({
          transaction: await context.commit({
            id: 'content',
            kind: nodeOperations.create,
            message: null,
            changes: [create('content', { kind: 'paragraph', text: 'Accepted' })],
          }),
        }),
      }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await handle.done;
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data).toMatchObject({
    status: 'complete',
    output: { transaction: 'content' },
  });
  expect(handle.snapshot().contextError).toBe('Snapshot unavailable');
});

test('content publication failure is distinguishable from a tool outcome save failure', async () => {
  const { nodes, prepared } = await fixture();
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: (value) =>
        value.id === 'content'
          ? Promise.reject(new Error('Content rejected'))
          : nodes.commit(value),
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    writableKinds: ['paragraph'],
    tools: (context) => ({
      first: tool({
        inputSchema: z.object({}),
        execute: async () =>
          await context.commit({
            id: 'content',
            kind: nodeOperations.create,
            message: null,
            changes: [create('content', { kind: 'paragraph', text: 'Rejected' })],
          }),
      }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await handle.done;
  expect(handle.snapshot()).toMatchObject({
    persistenceStage: 'content',
    contentPersistence: { error: 'Content rejected', request: { id: 'content' } },
  });
  expect(handle.snapshot().pendingTool).toBeUndefined();
  expect((await nodes.snapshot()).get('content')).toBeUndefined();
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('failed');
});

test('Stop during invocation acceptance drains its receipt without starting the tool and reopens uncertainty', async () => {
  const { nodes, prepared } = await fixture();
  let entered!: () => void;
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let effects = 0;
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'recordTool') {
          entered();
          await hold;
        }
        return await nodes.commit(value);
      },
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    tools: () => ({
      first: tool({
        inputSchema: z.object({}),
        execute: () => {
          effects++;
          return 'Effect';
        },
      }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await writing;
  handle.stop();
  release();
  expect((await handle.done).phase).toBe('stopped');
  expect(effects).toBe(0);
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('running');
  const reopened = createAgentBackend({
    nodes,
    model: () => Promise.reject(new Error('No replay')),
  });
  expect((await reopened.start(prepared).done).phase).toBe('stopped');
});

test('Stop during a delayed outcome write waits for acceptance and preserves its completed data', async () => {
  const { nodes, prepared } = await fixture();
  let entered!: () => void;
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeTool') {
          entered();
          await hold;
        }
        return await nodes.commit(value);
      },
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    tools: () => ({
      first: tool({ inputSchema: z.object({}), execute: () => 'Completed before Stop' }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await writing;
  handle.stop();
  release();
  expect((await handle.done).phase).toBe('stopped');
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data).toMatchObject({
    status: 'complete',
    output: 'Completed before Stop',
  });
});

test('retry during Stop clears the outcome obligation before an independently retryable terminal save', async () => {
  const { nodes, prepared } = await fixture();
  let outcomeFails = true;
  let terminalFails = true;
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: (value) => {
        if (value.kind.action === 'completeTool' && outcomeFails)
          return Promise.reject(new Error('Outcome offline'));
        if (value.kind.action === 'stopRun' && terminalFails)
          return Promise.reject(new Error('Terminal offline'));
        return nodes.commit(value);
      },
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    tools: () => ({
      first: tool({ inputSchema: z.object({}), execute: () => 'Known result' }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  handle.stop();
  await handle.done;
  outcomeFails = false;
  expect((await handle.retrySave()).persistenceStage).toBe('terminal');
  expect(handle.snapshot().pendingTool).toBeUndefined();
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('complete');
  terminalFails = false;
  expect((await handle.retrySave()).phase).toBe('stopped');
  expect(handle.snapshot().persistenceStage).toBeUndefined();
});

test('Stop during recovery acceptance produces one terminal write after the outcome settles', async () => {
  const { nodes, prepared } = await fixture();
  let failed = false;
  let recovering!: () => void;
  let release!: () => void;
  const accepting = new Promise<void>((resolve) => {
    recovering = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let terminals = 0;
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeTool') {
          if (!failed) {
            failed = true;
            throw new Error('Offline');
          }
          recovering();
          await hold;
        }
        if (value.kind.action === 'stopRun') terminals++;
        return await nodes.commit(value);
      },
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    tools: () => ({
      first: tool({ inputSchema: z.object({}), execute: () => 'Known' }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  const retry = handle.retrySave();
  await accepting;
  handle.stop();
  release();
  expect((await retry).phase).toBe('stopped');
  await handle.done;
  expect(handle.snapshot().phase).toBe('stopped');
  expect(terminals).toBe(1);
});

test('a saved terminal response can be retried with its same identity while preserving accepted tool activity', async () => {
  const { nodes, prepared } = await fixture();
  let terminalFails = true;
  const writes: unknown[] = [];
  const model = new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] });
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: (value) => {
        if (value.kind.action === 'completeRun') {
          writes.push(value);
          // biome-ignore lint/suspicious/noUnnecessaryConditions: caller changes injected transport state after run.done.
          if (terminalFails) return Promise.reject(new Error('Terminal offline'));
        }
        return nodes.commit(value);
      },
    },
    model: async () => model,
    tools: () => ({
      first: tool({ inputSchema: z.object({}), execute: () => 'Accepted result' }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  expect((await handle.done).persistenceStage).toBe('terminal');
  terminalFails = false;
  expect((await handle.retrySave()).phase).toBe('complete');
  expect(handle.snapshot().tools?.[0]?.data.output).toBe('Accepted result');
  expect(writes[1]).toEqual(writes[0]);
  expect(model.doStreamCalls).toHaveLength(2);
});

test('an unfinished historical invocation exposes uncertain effects without starting a model or tool', async () => {
  const { nodes, prepared } = await fixture();
  let failing = true;
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: (value) =>
        value.kind.action === 'completeTool' && failing
          ? Promise.reject(new Error('Offline'))
          : nodes.commit(value),
    },
    model: async () => new MockLanguageModelV4({ doStream: [call('first', 'first'), answer()] }),
    tools: () => ({
      first: tool({ inputSchema: z.object({}), execute: () => 'Known only to old owner' }),
      later: tool({ inputSchema: z.object({}), execute: () => 'Unused' }),
    }),
  }).start(prepared);
  await waitFor(handle, (state) => state.phase === 'paused');
  const recorded = await readAgentRun(nodes, 'run');
  expect(recorded?.tools[0]?.effects).toBe('uncertain');
  let models = 0;
  const reopened = createAgentBackend({
    nodes,
    model: () => {
      models++;
      return Promise.reject(new Error('No replay'));
    },
  });
  expect((await reopened.start(prepared).done).phase).toBe('recorded');
  expect(models).toBe(0);
  handle.stop();
  await handle.done;
  failing = false;
  await handle.retrySave();
});

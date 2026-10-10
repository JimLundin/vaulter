import { expect, test } from 'vitest';
import { tool } from 'ai';
type ModelStream = Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'];
type ModelStreamPart = ModelStream extends ReadableStream<infer Part> ? Part : never;
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request, seed } from '../vault/nodes/fixtures.test-support.ts';
import { nodeOperations } from '../vault/nodes/operations.ts';
import { prepareAgentRun, readAgentRun } from './store.ts';
import { createAgentBackend } from './runtime.ts';
import type { AgentToolFactory } from './tools.ts';

const at = '2026-10-10T12:00:00Z';
const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const streamed = (parts: readonly ModelStreamPart[], reason: 'stop' | 'tool-calls' = 'stop') => ({
  stream: convertArrayToReadableStream<ModelStreamPart>([
    { type: 'stream-start', warnings: [] },
    ...parts,
    { type: 'finish', finishReason: { unified: reason, raw: undefined }, usage },
  ]),
});
const calls = (name: string, input: unknown, call = 'call') =>
  streamed(
    [{ type: 'tool-call', toolCallId: call, toolName: name, input: JSON.stringify(input) }],
    'tool-calls',
  );
const answer = () =>
  streamed([
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: 'Done.' },
    { type: 'text-end', id: 't' },
  ]);
async function fixture(names = ['publish']) {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(
    request('actors', [create('agent', { kind: 'agent', name: 'Fictional Agent' })]),
  );
  const prepared = await prepareAgentRun(nodes, {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at,
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 4 },
    enabledTools: names.map((name) => ({ name })),
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Publish a paragraph.',
        },
      },
    ],
  });
  return { nodes, prepared };
}

test('a module publishes content through a durable attributed invocation and reads it independently of Chat', async () => {
  const { nodes, prepared } = await fixture();
  const tools: AgentToolFactory = (context) => ({
    publish: tool({
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data).toMatchObject({
          status: 'running',
          input: { text: 'New content' },
          call: 'call',
        });
        const transaction = await context.commit({
          id: 'published',
          kind: nodeOperations.create,
          message: null,
          changes: [create('published-content', { kind: 'paragraph', text })],
        });
        return { node: 'published-content', transaction };
      },
    }),
  });
  const languageModel = new MockLanguageModelV4({
    doStream: [calls('publish', { text: 'New content' }), answer()],
  });
  const backend = createAgentBackend({
    nodes,
    model: async () => languageModel,
    tools,
    writableKinds: ['paragraph'],
  });
  expect((await backend.start(prepared).done).phase).toBe('complete');
  const saved = await readAgentRun(nodes, 'run');
  expect(saved?.tools[0]?.data).toMatchObject({
    status: 'complete',
    output: { node: 'published-content', transaction: 'published' },
  });
  expect(saved?.tools[0]?.version.placement?.parent).toBe('run');
  expect(saved?.tools[0]?.version.connection?.source).toEqual({
    node: 'run',
    transaction: 'start',
  });
  expect((await nodes.snapshot()).get('published-content')?.data?.text).toBe('New content');
  expect((await nodes.history()).find(({ id }) => id === 'published')).toMatchObject({
    recordedBy: 'agent',
    origin: 'run',
  });
  expect(languageModel.doStreamCalls).toHaveLength(2);
  const reopen = createAgentBackend({
    nodes,
    model: () => Promise.reject(new Error('Must not run')),
    tools,
  });
  expect((await reopen.start(prepared).done).phase).toBe('complete');
});

test('invocation persistence must finish before an SDK tool executes and failure withholds its effects', async () => {
  const { nodes, prepared } = await fixture();
  let writing!: () => void;
  let release!: () => void;
  const accepting = new Promise<void>((resolve) => {
    writing = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let effects = 0;
  const backend = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'recordTool') {
          writing();
          await hold;
          throw new Error('Invocation offline');
        }
        return await nodes.commit(value);
      },
    },
    model: async () =>
      new MockLanguageModelV4({ doStream: [calls('publish', { text: 'New' }), answer()] }),
    tools: () => ({
      publish: tool({
        inputSchema: z.object({ text: z.string() }),
        execute: () => {
          effects++;
          return 'Published';
        },
      }),
    }),
  });
  const handle = backend.start(prepared);
  await accepting;
  expect(effects).toBe(0);
  const paused = new Promise<void>((resolve) => {
    handle.subscribe(() => {
      if (handle.snapshot().phase === 'paused') resolve();
    });
  });
  release();
  await paused;
  expect(effects).toBe(0);
  expect(handle.snapshot()).toMatchObject({
    phase: 'paused',
    pendingTool: { stage: 'invocation', execution: { status: 'running', input: { text: 'New' } } },
    persistenceError: 'Invocation offline',
  });
  handle.stop();
  await handle.done;
});

test('an outcome save failure retains completed activity and pauses before the next module effect', async () => {
  const { nodes, prepared } = await fixture(['first', 'later']);
  const languageModel = new MockLanguageModelV4({
    doStream: [calls('first', {}, 'first-call'), calls('later', {}, 'later-call'), answer()],
  });
  let first = 0;
  let later = 0;
  const backend = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeTool') throw new Error('Outcome offline');
        return await nodes.commit(value);
      },
    },
    model: async () => languageModel,
    tools: () => ({
      first: tool({
        inputSchema: z.object({}),
        execute: () => {
          first++;
          return { accepted: true };
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
  });
  const handle = backend.start(prepared);
  const paused = new Promise<void>((resolve) => {
    handle.subscribe(() => {
      if (handle.snapshot().phase === 'paused') resolve();
    });
  });
  await paused;
  expect(handle.snapshot()).toMatchObject({
    phase: 'paused',
    pendingTool: {
      stage: 'outcome',
      execution: { status: 'complete', output: { accepted: true } },
    },
  });
  expect(first).toBe(1);
  expect(later).toBe(0);
  expect(languageModel.doStreamCalls).toHaveLength(1);
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('running');
  handle.stop();
  expect((await handle.done).phase).toBe('paused');
  expect(handle.snapshot().pendingTool?.execution.output).toEqual({ accepted: true });
});

test('a module updates its content locally with trusted attribution and preserves structural history', async () => {
  const { nodes, prepared } = await fixture(['update']);
  const backend = createAgentBackend({
    nodes,
    model: async () => new MockLanguageModelV4({ doStream: [calls('update', {}), answer()] }),
    writableKinds: ['paragraph'],
    tools: (context) => ({
      update: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const before = context.snapshot().get('evidence')!;
          const claimed = {
            id: 'edited',
            kind: nodeOperations.update,
            message: null,
            recordedBy: 'user',
            origin: 'page',
            undoOf: 'seed',
            changes: [
              {
                node: 'evidence',
                expected: before.key.transaction,
                data: { kind: 'paragraph', text: 'Keep afternoons free.' },
                placement: before.placement,
                connection: before.connection,
              },
            ],
          };
          return { transaction: await context.commit(claimed) };
        },
      }),
    }),
  });
  expect((await backend.start(prepared).done).phase).toBe('complete');
  expect((await nodes.history()).find(({ id }) => id === 'edited')).toMatchObject({
    recordedBy: 'agent',
    origin: 'run',
    undoOf: null,
  });
  expect(await nodes.changes('edited')).toHaveLength(1);
  expect((await nodes.snapshot()).get('evidence')?.data?.text).toBe('Keep afternoons free.');
  expect((await nodes.snapshot()).get('appearance')?.key.transaction).toBe('seed');
});

test('declared reads reject a complete stale publication and record the tool failure durably', async () => {
  const { nodes, prepared } = await fixture(['update']);
  const backend = createAgentBackend({
    nodes,
    model: async () => new MockLanguageModelV4({ doStream: [calls('update', {}), answer()] }),
    writableKinds: ['paragraph'],
    tools: (context) => ({
      update: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const evidence = context.snapshot().get('evidence')!;
          await nodes.commit(
            request('external-edit', [
              {
                ...create('evidence', { kind: 'paragraph', text: 'Changed elsewhere.' }),
                expected: evidence.key.transaction,
              },
            ]),
          );
          return await context.commit({
            id: 'stale',
            kind: nodeOperations.create,
            message: null,
            changes: [
              create('first-content', { kind: 'paragraph', text: 'From stale evidence' }),
              create('second-content', { kind: 'paragraph', text: 'Also stale' }),
            ],
          });
        },
      }),
    }),
  });
  await backend.start(prepared).done;
  expect((await nodes.snapshot()).get('first-content')).toBeUndefined();
  expect((await nodes.snapshot()).get('second-content')).toBeUndefined();
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data).toMatchObject({
    status: 'failed',
    error: { code: 'toolFailed' },
  });
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.error?.message).toContain('Conflict');
});

test('a supplied Interpretation operation retains exact evidence and a proposal operation owns its publication choice', async () => {
  const { nodes, prepared } = await fixture(['interpret', 'propose']);
  const languageModel = new MockLanguageModelV4({
    doStream: [calls('interpret', {}), calls('propose', {}, 'proposal-call'), answer()],
  });
  const backend = createAgentBackend({
    nodes,
    model: async () => languageModel,
    writableKinds: ['interpretation', 'metadataReference', 'fictionalProposal'],
    tools: (context) => ({
      interpret: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const evidence = context.snapshot().resolve({ node: 'evidence', transaction: 'seed' })!;
          return await context.commit({
            id: 'interpretation',
            kind: nodeOperations.create,
            message: null,
            changes: [
              create('interpretation', {
                kind: 'interpretation',
                category: 'intention',
                at,
                statement: 'Protect studio mornings.',
                certainty: 'explicit',
                method: { name: 'fictional' },
              }),
              {
                ...create('evidence-link', { kind: 'metadataReference', role: 'evidence' }),
                placement: { parent: 'interpretation', order: 'a' },
                connection: {
                  source: { node: 'interpretation', transaction: 'interpretation' },
                  target: evidence.key,
                },
              },
            ],
          });
        },
      }),
      propose: tool({
        inputSchema: z.object({}),
        execute: async () =>
          await context.commit({
            id: 'proposal',
            kind: nodeOperations.create,
            message: null,
            changes: [
              create('proposal', {
                kind: 'fictionalProposal',
                proposedText: 'Change mornings later.',
                status: 'pendingReview',
              }),
            ],
          }),
      }),
    }),
  });
  expect((await backend.start(prepared).done).phase).toBe('complete');
  expect((await nodes.snapshot()).get('evidence-link')?.connection?.target).toEqual({
    node: 'evidence',
    transaction: 'seed',
  });
  expect((await nodes.snapshot()).get('evidence')?.data?.text).toBe('Keep mornings free.');
  expect((await nodes.snapshot()).get('proposal')?.data?.status).toBe('pendingReview');
  expect((await readAgentRun(nodes, 'run'))?.tools.map(({ data }) => data.status)).toEqual([
    'complete',
    'complete',
  ]);
});

test('Agent protects execution records while the caller composes its own transcript policy', async () => {
  const preservesTranscript = ({
    before,
    after,
  }: import('../vault/nodes/store.ts').NodeDifference) =>
    [before, after].every((version) => version?.data?.kind !== 'message');
  const { nodes, prepared } = await fixture(['modify']);
  await nodes.commit(
    request('transcript', [
      create('message', { kind: 'message', role: 'user', at, text: 'Retain this.' }),
    ]),
  );
  const languageModel = new MockLanguageModelV4({
    doStream: [
      calls('modify', { node: 'run' }, 'run-edit'),
      calls('modify', { node: 'message' }, 'message-edit'),
      answer(),
    ],
  });
  const backend = createAgentBackend({
    nodes,
    model: async () => languageModel,
    writableKinds: ['paragraph', 'agentRun', 'message'],
    contentPolicy: preservesTranscript,
    tools: (context) => ({
      modify: tool({
        inputSchema: z.object({ node: z.string() }),
        execute: async ({ node }) => {
          const before = context.snapshot().get(node)!;
          return await context.commit({
            id: `retag-${node}`,
            kind: nodeOperations.update,
            message: null,
            changes: [
              {
                node,
                expected: before.key.transaction,
                data: { kind: 'paragraph', text: 'Retagged' },
                placement: before.placement,
                connection: before.connection,
              },
            ],
          });
        },
      }),
    }),
  });
  await backend.start(prepared).done;
  expect((await nodes.snapshot()).get('message')?.data?.text).toBe('Retain this.');
  expect((await nodes.snapshot()).get('run')?.data?.kind).toBe('agentRun');
  expect((await readAgentRun(nodes, 'run'))?.tools.map(({ data }) => data.status)).toEqual([
    'failed',
    'failed',
  ]);
});

test('module definitions cannot publish before their invocation is accepted and retained handles expire after execution', async () => {
  const { nodes, prepared } = await fixture();
  let context!: import('./tools.ts').AgentToolContext;
  const backend = createAgentBackend({
    nodes,
    model: async () =>
      new MockLanguageModelV4({ doStream: [calls('publish', { text: 'New' }), answer()] }),
    writableKinds: ['paragraph'],
    tools: async (owned) => {
      context = owned;
      await expect(
        owned.commit({
          id: 'early-effect',
          kind: nodeOperations.create,
          message: null,
          changes: [create('early', { kind: 'paragraph', text: 'Too early' })],
        }),
      ).rejects.toThrow();
      return {
        publish: tool({
          inputSchema: z.object({ text: z.string() }),
          execute: ({ text }) => ({ text }),
        }),
      };
    },
  });
  expect((await backend.start(prepared).done).phase).toBe('complete');
  expect((await nodes.snapshot()).get('early')).toBeUndefined();
  expect(() => context.snapshot().get('evidence')).toThrow();
});

test('a failed first outcome also gates other tools emitted in the same model response', async () => {
  const { nodes, prepared } = await fixture(['first', 'later']);
  const both = streamed(
    [
      { type: 'tool-call', toolCallId: 'first', toolName: 'first', input: '{}' },
      { type: 'tool-call', toolCallId: 'later', toolName: 'later', input: '{}' },
    ],
    'tool-calls',
  );
  let later = 0;
  const model = new MockLanguageModelV4({ doStream: [both, answer()] });
  const handle = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeTool') throw new Error('Offline');
        return await nodes.commit(value);
      },
    },
    model: async () => model,
    tools: () => ({
      first: tool({ inputSchema: z.object({}), execute: () => 'First' }),
      later: tool({
        inputSchema: z.object({}),
        execute: () => {
          later++;
          return 'Later';
        },
      }),
    }),
  }).start(prepared);
  await new Promise<void>((resolve) => {
    handle.subscribe(() => {
      if (handle.snapshot().phase === 'paused') resolve();
    });
  });
  expect(later).toBe(0);
  expect(model.doStreamCalls).toHaveLength(1);
  handle.stop();
  await handle.done;
});

test('Agent retains a supplying module\u0027s accepted tool version in its durable invocation', async () => {
  const { nodes } = await fixture();
  const prepared = await prepareAgentRun(nodes, {
    id: 'versioned-start',
    run: 'versioned-run',
    agent: 'agent',
    recordedBy: 'user',
    at,
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 2 },
    enabledTools: [{ name: 'publish', version: 'v2' }],
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Publish',
        },
      },
    ],
  });
  const handle = createAgentBackend({
    nodes,
    model: async () => new MockLanguageModelV4({ doStream: [calls('publish', {}), answer()] }),
    tools: () => ({ publish: tool({ inputSchema: z.object({}), execute: () => 'Published' }) }),
  }).start(prepared);
  await handle.done;
  expect((await readAgentRun(nodes, 'versioned-run'))?.tools[0]?.data.version).toBe('v2');
});

test('owned execution references remain protected from a content operation that can create evidence links', async () => {
  const { nodes, prepared } = await fixture(['retag']);
  const contextual = await prepareAgentRun(nodes, {
    id: 'context-start',
    run: 'context-run',
    agent: 'agent',
    recordedBy: 'user',
    at,
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 2 },
    enabledTools: [{ name: 'retag' }],
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Retain evidence',
        },
        target: { node: 'evidence', transaction: 'seed' },
      },
    ],
  });
  const reference = contextual.commit.changes.find(
    (change) => change.data?.kind === 'metadataReference',
  )!;
  const handle = createAgentBackend({
    nodes,
    model: async () => new MockLanguageModelV4({ doStream: [calls('retag', {}), answer()] }),
    writableKinds: ['metadataReference', 'paragraph'],
    tools: (context) => ({
      retag: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const before = context.snapshot().get(reference.node)!;
          return await context.commit({
            id: 'retag-reference',
            kind: nodeOperations.update,
            message: null,
            changes: [
              {
                node: reference.node,
                expected: before.key.transaction,
                placement: null,
                connection: null,
                data: { kind: 'paragraph', text: 'Discard exact evidence' },
              },
            ],
          });
        },
      }),
    }),
  }).start(contextual);
  await handle.done;
  expect((await nodes.snapshot()).get(reference.node)?.data?.kind).toBe('metadataReference');
  expect((await readAgentRun(nodes, 'context-run'))?.tools[0]?.data.status).toBe('failed');
  expect((await nodes.snapshot()).get(prepared.run)).toBeUndefined();
});

test('accepted tool names must match caller selection and Agent installs no implicit capability', async () => {
  const { nodes, prepared } = await fixture(['chosen']);
  const languageModel = new MockLanguageModelV4({ doStream: [answer()] });
  let effects = 0;
  const handle = createAgentBackend({
    nodes,
    model: async () => languageModel,
    tools: () => ({
      unselected: tool({
        inputSchema: z.object({}),
        execute: () => {
          effects++;
          return 'Unexpected';
        },
      }),
    }),
  }).start(prepared);
  expect((await handle.done).phase).toBe('failed');
  expect(effects).toBe(0);
  expect(languageModel.doStreamCalls).toHaveLength(0);
  expect((await readAgentRun(nodes, 'run'))?.tools).toEqual([]);
});

test('a current write snapshot cannot erase stale dependencies captured through a retained read handle', async () => {
  const { nodes, prepared } = await fixture(['publish']);
  const handle = createAgentBackend({
    nodes,
    model: async () => new MockLanguageModelV4({ doStream: [calls('publish', {}), answer()] }),
    writableKinds: ['paragraph'],
    tools: (context) => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const old = context.snapshot();
          const evidence = old.get('evidence')!;
          await nodes.commit(
            request('changed-evidence', [
              {
                ...create('evidence', { kind: 'paragraph', text: 'Changed elsewhere' }),
                expected: evidence.key.transaction,
              },
            ]),
          );
          await context.commit({
            id: 'unrelated-write',
            kind: nodeOperations.create,
            message: null,
            changes: [
              create('unrelated', { kind: 'paragraph', text: 'Still depends on old evidence' }),
            ],
          });
          return 'Unexpected';
        },
      }),
    }),
  }).start(prepared);
  await handle.done;
  expect((await nodes.snapshot()).get('unrelated')).toBeUndefined();
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('failed');
});

import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request, seed } from '../vault/nodes/fixtures.test-support.ts';
import { createAgentBackend } from './runtime.ts';
import { prepareAgentRun, readAgentRun } from './store.ts';
import { nodeOperations } from '../vault/nodes/operations.ts';
import { serial } from '../vault/storage/coordination.ts';
import type { AgentToolContext } from './tools.ts';

function gate() {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}
function answerResponse(): Awaited<ReturnType<MockLanguageModelV4['doStream']>> {
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', delta: 'Complete.' },
      { type: 'text-end', id: 'text' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      },
    ]),
  };
}
function answer() {
  return new MockLanguageModelV4({ doStream: async () => answerResponse() });
}
function toolModel() {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'tool-call', toolCallId: 'call', toolName: 'publish', input: '{}' },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ]),
      },
      answerResponse(),
    ],
  });
}
async function fixture() {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('actors', [create('agent', { kind: 'agent' })]));
  const prepare = (run: string, tools = false) =>
    prepareAgentRun(nodes, {
      id: `${run}-start`,
      run,
      agent: 'agent',
      recordedBy: 'user',
      at: '2026-10-10T12:00:00Z',
      provider: 'fictional',
      model: 'fictional',
      settings: { maxSteps: 2 },
      enabledTools: tools ? [{ name: 'publish' }] : [],
      context: [
        {
          data: {
            kind: 'contextInput',
            role: 'user',
            position: 0,
            transformation: 'verbatim',
            content: `Complete ${run}.`,
          },
        },
      ],
    });
  return { nodes, prepare };
}

test('simultaneous callers share one live run while validating the full prepared request', async () => {
  const { nodes, prepare } = await fixture();
  const prepared = await prepare('shared');
  const loading = gate();
  const entered = gate();
  let models = 0;
  const options = {
    nodes,
    model: async () => {
      models++;
      entered.release();
      await loading.held;
      return answer();
    },
  };
  const firstBackend = createAgentBackend(options);
  const secondBackend = createAgentBackend(options);
  const first = firstBackend.start(prepared);
  const second = secondBackend.start(prepared);
  await entered.held;
  try {
    expect(second).toBe(first);
    expect(models).toBe(1);
    expect(() =>
      secondBackend.start({
        ...prepared,
        commit: { ...prepared.commit, message: 'Changed composed request' },
      }),
    ).toThrow('different contents');
  } finally {
    loading.release();
    await Promise.all([first.done, second.done]);
  }
});

test('a supplying module coordinates its operations while an unrelated held-tool run publishes independently', async () => {
  const { nodes, prepare } = await fixture();
  const firstRequest = await prepare('first', true);
  const queuedRequest = await prepare('queued', true);
  const unrelatedRequest = await prepare('unrelated', true);
  const held = gate();
  const entered = gate();
  const queued = gate();
  const coordinate = serial();
  const content = (context: AgentToolContext, name: string) =>
    context.commit({
      id: `${name}-content`,
      kind: nodeOperations.create,
      message: null,
      changes: [create(`${name}-paragraph`, { kind: 'paragraph', text: name })],
    });
  const coordinated = (name: string) =>
    createAgentBackend({
      nodes,
      model: async () => toolModel(),
      writableKinds: ['paragraph'],
      tools: (context) => ({
        publish: tool({
          inputSchema: z.object({}),
          execute: async () => {
            if (name === 'queued') queued.release();
            return await coordinate(async () => {
              if (name === 'first') {
                entered.release();
                await held.held;
              }
              return await content(context, name);
            }, context.signal);
          },
        }),
      }),
    });
  const first = coordinated('first').start(firstRequest);
  await entered.held;
  const second = coordinated('queued').start(queuedRequest);
  await queued.held;
  const independent = createAgentBackend({
    nodes,
    model: async () => toolModel(),
    writableKinds: ['paragraph'],
    tools: (context) => ({
      publish: tool({
        inputSchema: z.object({}),
        execute: async () => await content(context, 'unrelated'),
      }),
    }),
  }).start(unrelatedRequest);
  try {
    expect((await independent.done).phase).toBe('complete');
    const snapshot = await nodes.snapshot();
    expect(snapshot.get('unrelated-paragraph')?.data?.text).toBe('unrelated');
    expect(snapshot.get('first-paragraph')).toBeUndefined();
    expect(snapshot.get('queued-paragraph')).toBeUndefined();
  } finally {
    held.release();
    await Promise.all([first.done, second.done]);
  }
  const publications = (await nodes.history()).filter(({ id }) => id.endsWith('-content'));
  expect(publications.map(({ id }) => id)).toEqual([
    'queued-content',
    'first-content',
    'unrelated-content',
  ]);
  expect(new Set(publications.map(({ sequence }) => sequence)).size).toBe(3);
  expect((await readAgentRun(nodes, 'queued'))?.tools[0]?.data.status).toBe('complete');
});

test('readers share available local ownership evidence while unknown ownership stays uncertain', async () => {
  const { nodes, prepare } = await fixture();
  const prepared = await prepare('live');
  const loading = gate();
  const entered = gate();
  const owner = createAgentBackend({
    nodes,
    model: async () => {
      entered.release();
      await loading.held;
      return answer();
    },
  });
  const reader = createAgentBackend({ nodes, model: async () => answer() });
  const handle = owner.start(prepared);
  await entered.held;
  try {
    expect(await reader.read('live')).toMatchObject({
      data: { status: 'running' },
      ownership: 'live',
    });
    const { sequence } = (await nodes.history()).find(({ id }) => id === prepared.commit.id)!;
    expect(await reader.read('live', sequence)).toMatchObject({
      data: { status: 'running' },
      ownership: 'unknown',
    });
    const remote = await prepare('remote');
    await nodes.commit(remote.commit);
    expect(await reader.read('remote')).toMatchObject({
      data: { status: 'running' },
      ownership: 'unknown',
    });
  } finally {
    loading.release();
    await handle.done;
  }
  expect(await readAgentRun(nodes, 'live')).toMatchObject({
    data: { status: 'complete' },
    ownership: 'unknown',
  });
});

test('disposing a reader does not stop another caller and disposing a settled recovery owner releases evidence', async () => {
  const { nodes, prepare } = await fixture();
  const prepared = await prepare('owned');
  const loading = gate();
  const entered = gate();
  const owner = createAgentBackend({
    nodes,
    model: async () => {
      entered.release();
      await loading.held;
      return answer();
    },
  });
  const reader = createAgentBackend({ nodes, model: async () => answer() });
  const handle = owner.start(prepared);
  expect(reader.start(prepared)).toBe(handle);
  await entered.held;
  reader.dispose();
  loading.release();
  expect((await handle.done).phase).toBe('complete');

  const recoveryRequest = await prepare('recovery');
  const transport = {
    ...nodes,
    commit: async (value: import('../vault/nodes/store.ts').NodeCommit) => {
      await nodes.commit(value);
      throw new Error('Acceptance response lost');
    },
  };
  const recovering = createAgentBackend({ nodes: transport, model: async () => answer() });
  const recovery = recovering.start(recoveryRequest);
  expect((await recovery.done).phase).toBe('unsaved');
  expect((await recovering.read('recovery'))?.ownership).toBe('live');
  recovering.dispose();
  expect((await readAgentRun(transport, 'recovery'))?.ownership).toBe('unknown');
});

test('stopping a held model run does not expire another run\u0027s context or accepted content', async () => {
  const { nodes, prepare } = await fixture();
  const loading = gate();
  const modelEntered = gate();
  const effectEntered = gate();
  const effectRelease = gate();
  const first = createAgentBackend({
    nodes,
    model: async () => {
      modelEntered.release();
      await loading.held;
      return answer();
    },
  }).start(await prepare('stopping'));
  await modelEntered.held;
  let supplied!: AgentToolContext;
  const second = createAgentBackend({
    nodes,
    model: async () => toolModel(),
    writableKinds: ['paragraph'],
    tools: (context) => {
      supplied = context;
      return {
        publish: tool({
          inputSchema: z.object({}),
          execute: async () => {
            effectEntered.release();
            await effectRelease.held;
            return await context.commit({
              id: 'surviving-content',
              kind: nodeOperations.create,
              message: null,
              changes: [create('surviving-paragraph', { kind: 'paragraph', text: 'Survived.' })],
            });
          },
        }),
      };
    },
  }).start(await prepare('surviving', true));
  await effectEntered.held;
  first.stop();
  try {
    expect((await first.done).phase).toBe('stopped');
    expect(supplied.signal.aborted).toBe(false);
    expect(supplied.snapshot().get('evidence')?.data?.text).toBe('Keep mornings free.');
    effectRelease.release();
    expect((await second.done).phase).toBe('complete');
    expect((await nodes.snapshot()).get('surviving-paragraph')?.data?.text).toBe('Survived.');
    expect((await readAgentRun(nodes, 'surviving'))?.tools[0]?.data.status).toBe('complete');
  } finally {
    loading.release();
    effectRelease.release();
    await second.done;
  }
});

test.each(['changed-node', 'declared-read'])(
  'concurrent %s conflict rejects the entire stale publication',
  async (dependency) => {
    const { nodes, prepare } = await fixture();
    const staleEntered = gate();
    const staleRelease = gate();
    const stale = createAgentBackend({
      nodes,
      model: async () => toolModel(),
      writableKinds: ['paragraph'],
      tools: (context) => ({
        publish: tool({
          inputSchema: z.object({}),
          execute: async () => {
            const before = context.snapshot().get('evidence')!;
            staleEntered.release();
            await staleRelease.held;
            return await context.commit({
              id: 'stale-publication',
              kind: nodeOperations.update,
              message: null,
              ...(dependency === 'declared-read'
                ? { expectedReads: { evidence: before.key.transaction } }
                : {}),
              changes: [
                create('stale-paragraph', { kind: 'paragraph', text: 'Must be rejected.' }),
                ...(dependency === 'changed-node'
                  ? [
                      {
                        node: 'evidence',
                        expected: before.key.transaction,
                        placement: before.placement,
                        connection: before.connection,
                        data: { kind: 'paragraph', text: 'Stale edit.' },
                      },
                    ]
                  : []),
              ],
            });
          },
        }),
      }),
    }).start(await prepare('stale', true));
    await staleEntered.held;
    const fresh = createAgentBackend({
      nodes,
      model: async () => toolModel(),
      writableKinds: ['paragraph'],
      tools: (context) => ({
        publish: tool({
          inputSchema: z.object({}),
          execute: async () => {
            const before = context.snapshot().get('evidence')!;
            return await context.commit({
              id: 'fresh-publication',
              kind: nodeOperations.update,
              message: null,
              changes: [
                {
                  node: 'evidence',
                  expected: before.key.transaction,
                  placement: before.placement,
                  connection: before.connection,
                  data: { kind: 'paragraph', text: 'Fresh edit.' },
                },
              ],
            });
          },
        }),
      }),
    }).start(await prepare('fresh', true));
    try {
      expect((await fresh.done).phase).toBe('complete');
    } finally {
      staleRelease.release();
      await stale.done;
    }
    const snapshot = await nodes.snapshot();
    expect(snapshot.get('evidence')?.data?.text).toBe('Fresh edit.');
    expect(snapshot.get('stale-paragraph')).toBeUndefined();
    expect((await nodes.history()).some(({ id }) => id === 'stale-publication')).toBe(false);
    expect((await readAgentRun(nodes, 'stale'))?.tools[0]?.data).toMatchObject({
      status: 'failed',
      error: { code: 'toolFailed' },
    });
    expect((await readAgentRun(nodes, 'stale'))?.tools[0]?.data.error?.message).toContain(
      'Conflict',
    );
  },
);

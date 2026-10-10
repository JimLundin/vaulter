import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request, revise, seed } from '../vault/nodes/fixtures.test-support.ts';
import { prepareAgentRun, readAgentRun } from './store.ts';
import { createAgentBackend } from './runtime.ts';

const at = '2026-10-10T12:00:00Z';
async function fixture() {
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
    model: 'fictional-model',
    settings: { temperature: 0 },
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Keep mornings free.',
        },
        target: { node: 'evidence', transaction: 'seed' },
      },
    ],
  });
  return { nodes, prepared };
}
function model(text = 'Recorded.') {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: text },
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
}

test('a caller runs Agent without Chat and reads exact supplied context and durable outcome', async () => {
  const { nodes, prepared } = await fixture();
  const languageModel = model();
  const backend = createAgentBackend({
    nodes,
    model: async () => {
      expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('running');
      return languageModel;
    },
  });
  const handle = backend.start(prepared);
  const phases: string[] = [];
  handle.subscribe(() => phases.push(handle.snapshot().phase));
  expect((await handle.done).phase).toBe('complete');
  expect(phases).toContain('running');
  const recorded = await readAgentRun(nodes, 'run');
  expect(recorded?.data).toMatchObject({
    status: 'complete',
    output: { text: 'Recorded.' },
    usage: { input: 3, output: 2 },
    settings: { temperature: 0 },
  });
  expect(recorded?.context[0].data.content).toBe('Keep mornings free.');
  expect(recorded?.context[0].references[0].connection?.target).toEqual({
    node: 'evidence',
    transaction: 'seed',
  });
  const history = await nodes.history();
  expect(history[0]).toMatchObject({
    recordedBy: 'agent',
    origin: 'run',
    kind: { scope: 'agent', action: 'completeRun' },
  });
  expect(await nodes.changes(history[0]!.id)).toHaveLength(1);
  expect(
    (await nodes.changes('start')).some(({ after }) =>
      ['conversation', 'exchange', 'message'].includes(String(after.data?.kind)),
    ),
  ).toBe(false);
  expect((await readAgentRun(nodes, 'run', history[1]!.sequence))?.data.status).toBe('running');
  const reopened = createAgentBackend({
    nodes,
    model: () => Promise.reject(new Error('Must not execute')),
  });
  expect((await reopened.start(prepared).done).phase).toBe('complete');
  expect(languageModel.doStreamCalls).toHaveLength(1);
});

test('a rejected or delayed initial acceptance invokes no model and a lost response retries persistence only', async () => {
  const { nodes, prepared } = await fixture();
  const languageModel = model();
  let release!: () => void;
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const commits: unknown[] = [];
  const backend = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        commits.push(value);
        entered();
        await held;
        await nodes.commit(value);
        if (commits.length === 1) throw new Error('Lost acceptance response');
        return await nodes.commit(value);
      },
    },
    model: async () => languageModel,
  });
  const handle = backend.start(prepared);
  await writing;
  expect(languageModel.doStreamCalls).toHaveLength(0);
  release();
  expect((await handle.done).phase).toBe('unsaved');
  expect(handle.snapshot().persistenceError).toBe('Lost acceptance response');
  expect((await handle.retrySave()).phase).toBe('recorded');
  expect(commits[1]).toEqual(commits[0]);
  expect(languageModel.doStreamCalls).toHaveLength(0);
  expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('running');
});

test('Stop during initial acceptance records a stopped run without invoking a model', async () => {
  const { nodes, prepared } = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let models = 0;
  const backend = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.id === 'start') {
          entered();
          await held;
        }
        return await nodes.commit(value);
      },
    },
    model: () => {
      models++;
      return Promise.resolve(model());
    },
  });
  const handle = backend.start(prepared);
  await writing;
  handle.stop();
  release();
  expect((await handle.done).phase).toBe('stopped');
  expect(models).toBe(0);
  expect((await readAgentRun(nodes, 'run'))?.data).toMatchObject({
    status: 'stopped',
    output: { text: '' },
  });
});

test('a completed outcome remains visible when saving fails and retry never repeats the model', async () => {
  const { nodes, prepared } = await fixture();
  const languageModel = model();
  let rejectOutcome = true;
  const saves: unknown[] = [];
  const backend = createAgentBackend({
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeRun') {
          saves.push(value);
          // biome-ignore lint/suspicious/noUnnecessaryConditions: the caller toggles this transport failure after run.done.
          if (rejectOutcome) throw new Error('Offline');
        }
        return await nodes.commit(value);
      },
    },
    model: async () => languageModel,
  });
  const handle = backend.start(prepared);
  expect(await handle.done).toMatchObject({
    phase: 'unsaved',
    persistenceError: 'Offline',
    data: { status: 'complete', output: { text: 'Recorded.' } },
    text: 'Recorded.',
  });
  expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('running');
  rejectOutcome = false;
  expect((await handle.retrySave()).phase).toBe('complete');
  expect(saves[1]).toEqual(saves[0]);
  expect(languageModel.doStreamCalls).toHaveLength(1);
  expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('complete');
});

test('changed contents under a retained identity are rejected even after reopening', async () => {
  const { nodes, prepared } = await fixture();
  const backend = createAgentBackend({ nodes, model: async () => model() });
  const handle = backend.start(prepared);
  await handle.done;
  expect(backend.start(prepared)).toBe(handle);
  const changed = { ...prepared, commit: { ...prepared.commit, message: 'Different request' } };
  expect(() => backend.start(changed)).toThrow('different contents');
  const reopened = createAgentBackend({ nodes, model: async () => model() });
  expect(await reopened.start(changed).done).toMatchObject({ phase: 'failed' });
  expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('complete');
});

test('execution failure is recorded separately from persistence failure', async () => {
  const { nodes, prepared } = await fixture();
  const backend = createAgentBackend({
    nodes,
    model: () => Promise.reject(new Error('Provider unavailable')),
  });
  const result = await backend.start(prepared).done;
  expect(result).toMatchObject({
    phase: 'failed',
    data: { status: 'failed', error: { code: 'executionFailed', message: 'Provider unavailable' } },
  });
  expect(result.persistenceError).toBeUndefined();
  expect((await readAgentRun(nodes, 'run'))?.data).toMatchObject({
    status: 'failed',
    error: { message: 'Provider unavailable' },
  });
});

test('Stop while model loading settles without relying on provider cancellation', async () => {
  const { nodes, prepared } = await fixture();
  let entered!: () => void;
  const loading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const backend = createAgentBackend({
    nodes,
    model: () => {
      entered();
      return new Promise(() => {
        /* Fictional stuck provider. */
      });
    },
  });
  const handle = backend.start(prepared);
  await loading;
  handle.stop();
  expect((await handle.done).phase).toBe('stopped');
  expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('stopped');
});

test('generated structured context and supplied settings describe the effective provider inputs', async () => {
  const { nodes } = await fixture();
  const prepared = await prepareAgentRun(nodes, {
    id: 'structured-start',
    run: 'structured-run',
    agent: 'agent',
    recordedBy: 'user',
    at,
    provider: 'fictional',
    model: 'fictional-model',
    settings: { temperature: 0 },
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'system',
          position: 0,
          transformation: 'verbatim',
          content: 'Answer briefly.',
        },
      },
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 1,
          transformation: 'generated',
          content: { message: { role: 'user', content: [{ type: 'text', text: 'A question' }] } },
        },
      },
    ],
  });
  const languageModel = model();
  const handle = createAgentBackend({ nodes, model: async () => languageModel }).start(prepared);
  expect((await handle.done).phase).toBe('complete');
  expect(languageModel.doStreamCalls[0]?.prompt).toEqual([
    { role: 'system', content: 'Answer briefly.' },
    { role: 'user', content: [{ type: 'text', text: 'A question' }] },
  ]);
  expect(languageModel.doStreamCalls[0]?.temperature).toBe(0);
});

test('caller-owned records compose atomically with Agent start and execution requires that acceptance', async () => {
  const { nodes, prepared } = await fixture();
  const composed = {
    ...prepared,
    commit: {
      ...prepared.commit,
      origin: 'caller',
      changes: [
        create('caller', { kind: 'fictionalTask', title: 'Organize a morning' }),
        ...prepared.commit.changes,
      ],
    },
  };
  const backend = createAgentBackend({
    nodes,
    model: async () => {
      expect((await nodes.snapshot()).get('caller')?.data?.title).toBe('Organize a morning');
      return model();
    },
  });
  expect((await backend.start(composed).done).phase).toBe('complete');
  expect((await nodes.changes('start')).map(({ node }) => node)).toContain('caller');
  const changed = {
    ...composed,
    commit: {
      ...composed.commit,
      changes: composed.commit.changes.map((change) =>
        change.node === 'caller'
          ? { ...change, data: { kind: 'fictionalTask', title: 'Changed' } }
          : change,
      ),
    },
  };
  expect(
    (await createAgentBackend({ nodes, model: async () => model() }).start(changed).done).phase,
  ).toBe('failed');
});

test('Agent-owned decoders retain future JSON fields while rejecting invalid known payloads', async () => {
  const { parseAgentRun, parseContextInput, parseToolExecution } = await import('./schema.ts');
  const { nodes, prepared } = await fixture();
  const original = prepared.commit.changes[0]!.data!;
  const extended = JSON.parse(JSON.stringify({ ...original, future: { retained: ['yes'] } }));
  expect(parseAgentRun(extended)).toEqual(extended);
  expect(Object.isFrozen(parseAgentRun(extended))).toBe(true);
  expect(
    parseContextInput({
      kind: 'contextInput',
      role: 'user',
      position: 0,
      transformation: 'verbatim',
      content: 'Hello',
      future: { retained: true },
    }),
  ).toMatchObject({ future: { retained: true } });
  expect(
    parseToolExecution({
      kind: 'toolExecution',
      call: 'call',
      name: 'sample',
      attempt: 1,
      started: at,
      status: 'running',
      input: null,
      future: { retained: true },
    }),
  ).toMatchObject({ future: { retained: true } });
  expect(() => parseAgentRun({ ...original, usage: { input: -1, output: 0 } })).toThrow();
  expect(() => parseAgentRun({ ...original, future: undefined })).toThrow();
  expect(() =>
    parseContextInput({
      kind: 'contextInput',
      role: 'user',
      position: -1,
      transformation: 'verbatim',
      content: 'Hello',
    }),
  ).toThrow();
  expect((await nodes.snapshot()).get('run')).toBeUndefined();
});

test('recorded author configuration and provider identity stay exact across later Agent edits', async () => {
  const { nodes, prepared } = await fixture();
  const languageModel = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: 'fictional-request',
          modelId: 'served-model',
          timestamp: new Date(at),
        },
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
  await createAgentBackend({ nodes, model: async () => languageModel }).start(prepared).done;
  await nodes.commit(
    request('changed-agent', [
      await revise(nodes, 'agent', { kind: 'agent', name: 'Changed Agent' }),
    ]),
  );
  const recorded = await readAgentRun(nodes, 'run');
  expect(recorded?.data).toMatchObject({
    model: { requested: 'fictional-model', served: 'served-model' },
    request: 'fictional-request',
  });
  expect(recorded?.version.connection?.target).toEqual({ node: 'agent', transaction: 'actors' });
});

test('composed context for another run cannot replace this run\u0027s supplied model inputs', async () => {
  const { nodes, prepared } = await fixture();
  const composed = {
    ...prepared,
    commit: {
      ...prepared.commit,
      changes: [
        ...prepared.commit.changes,
        create('other-run', { kind: 'fictionalTask' }),
        {
          ...create('other-input', {
            kind: 'contextInput',
            role: 'user',
            position: 1,
            transformation: 'verbatim',
            content: 'Another question',
          }),
          placement: { parent: 'other-run', order: 'a' },
        },
      ],
    },
  };
  const languageModel = model();
  await createAgentBackend({ nodes, model: async () => languageModel }).start(composed).done;
  expect(languageModel.doStreamCalls[0]?.prompt).toEqual([
    { role: 'user', content: [{ type: 'text', text: 'Keep mornings free.' }] },
  ]);
});

test('invalid model settings reject before acceptance instead of recording ineffective values', async () => {
  const { nodes } = await fixture();
  await expect(
    prepareAgentRun(nodes, {
      id: 'invalid',
      run: 'invalid-run',
      agent: 'agent',
      recordedBy: 'user',
      at,
      provider: 'fictional',
      model: 'fictional-model',
      settings: { temperature: 'hot', tools: {} },
      context: [],
    }),
  ).rejects.toThrow();
  expect((await nodes.snapshot()).get('invalid-run')).toBeUndefined();
});

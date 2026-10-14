import { transactionFixture } from './vault/transactions/fixtures.test-support.ts';
import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { productChatOptions, productNodes } from './product.tsx';
import { memoryNodeBackend } from './vault/nodes/memory.ts';
import { create, request, revise } from './vault/nodes/fixtures.test-support.ts';
import { prepareAgentRunFixture as prepareAgentRun } from './agent/preparation.test-support.ts';
import { createAgentBackend } from './agent/runtime.ts';
import { agentContentContext } from './agent/tool-context.ts';
import { NodePublicationRejected } from './vault/nodes/history.ts';
import { createApplicationIdentities } from './application-identities.ts';
import { canonical } from './vault/nodes/json.ts';
import { previewModel } from './preview/model.ts';

test('every Product node entry rejects handcrafted Questions and task Relationships atomically', async () => {
  const raw = memoryNodeBackend();
  await raw.commit(
    request('historical', [
      create('user', { kind: 'actor' }),
      create('question', { kind: 'question', text: 'Which wall?' }),
      create('source', { kind: 'content', text: 'Garden wall.' }),
    ]),
  );
  const nodes = productNodes(transactionFixture(raw));
  expect(productNodes(nodes)).toBe(nodes);
  const configured = productChatOptions({
    nodes: transactionFixture(raw),
    model: async () => previewModel,
    selectedModel: 'fictional',
    provider: 'fictional',
    instructions: '',
  });
  expect(configured.nodes).toBe(nodes);
  expect('commit' in nodes).toBe(false);
  using writes = nodes.writer({ recordedBy: 'user', origin: null }).lifetime();
  const before = await nodes.snapshot();
  const retagged = await revise(nodes, 'question', { kind: 'content', text: 'Retagged.' });
  for (const changes of [
    [create('missing-text', { kind: 'question' })],
    [
      create('plausible', {
        kind: 'question',
        text: 'Where?',
        suggestions: [{ title: 'Garden', text: 'Garden wall.', reason: 'Morning light.' }],
      }),
    ],
    [retagged],
    [create('hidden', { kind: 'content', text: 'Unexpected child.' }, 'question')],
    [
      {
        ...create('answer-link', { kind: 'relationship', predicate: 'answered-by' }),
        connection: { source: { node: 'question' }, target: { node: 'source' } },
      },
    ],
  ]) {
    await expect(
      writes.write(() => ({
        value: undefined,
        transaction: request(`forged-${changes[0]!.node}`, [
          create(`foreign-${changes[0]!.node}`, { kind: 'content', text: 'Atomic companion.' }),
          ...changes,
        ]),
      })).result,
    ).rejects.toBeInstanceOf(NodePublicationRejected);
  }
  expect((await nodes.snapshot()).sequence).toBe(before.sequence);
  expect((await nodes.snapshot()).get('question')?.data?.kind).toBe('question');
  // Foreign references to the Question stay with their source owner.
  await writes.write(() => ({
    value: undefined,
    transaction: request('reference', [
      {
        ...create('reference', { kind: 'relationship', predicate: 'mentions' }),
        connection: { source: { node: 'source' }, target: { node: 'question' } },
      },
    ]),
  })).result;
  expect((await nodes.snapshot()).get('reference')).toBeDefined();
  raw.close();
});

test('an initial Chat/Agent transaction cannot smuggle a Question around the tool publication seam', async () => {
  const raw = memoryNodeBackend();
  const setup = createApplicationIdentities(transactionFixture(raw));
  await setup.ensure();
  const nodes = productNodes(transactionFixture(raw));
  const prepared = await prepareAgentRun(
    nodes,
    {
      id: 'initial',
      run: 'run',
      agent: setup.identities.agent,
      recordedBy: setup.identities.user,
      at: '2026-10-13T12:00:00Z',
      provider: 'fictional',
      model: 'fictional',
      settings: {},
      context: [],
    },
    (prepared) => ({
      ...prepared,
      commit: {
        ...prepared.commit,
        changes: [
          ...prepared.commit.changes,
          create('smuggled', { kind: 'question', text: 'Where?' }),
        ],
      },
    }),
  );
  let models = 0;
  const backend = createAgentBackend({
    nodes,
    model: () => {
      models++;
      return Promise.resolve(previewModel);
    },
  });
  const outcome = await backend.start(prepared).done;
  expect(outcome.phase).toBe('unsaved');
  expect(outcome.persistenceError).toContain('Questions create or answer action');
  expect(models).toBe(0);
  expect((await nodes.snapshot()).get('run')).toBeUndefined();
  expect((await nodes.snapshot()).get('smuggled')).toBeUndefined();
  backend.dispose();
  raw.close();
});

test('another admitted tool cannot write Questions or leave owner rejection as a save obligation', async () => {
  const raw = memoryNodeBackend();
  await raw.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('agent', { kind: 'agent' }),
      create('run', { kind: 'agentRun' }),
    ]),
  );
  const nodes = productNodes(transactionFixture(raw));
  let failedSaves = 0;
  const guarded = agentContentContext({
    nodes,
    agent: 'agent',
    run: 'run',
    signal: new AbortController().signal,
    live: () => true,
    executing: () => true,
    writableKinds: ['content', 'question', 'relationship'],
    snapshot: await nodes.snapshot(),
    publicationFailed: () => {
      failedSaves++;
    },
    refreshFailed: () => undefined,
  });
  const supplied = tool({
    inputSchema: z.object({}),
    execute: () =>
      guarded.context.write((id) => ({
        id,
        kind: { scope: 'questions', action: 'ask' },
        message: null,
        changes: [create('tool-question', { kind: 'question', text: 'Where?' })],
      })),
  });
  await expect(
    supplied.execute!({}, { toolCallId: 'call', messages: [], context: {} }),
  ).rejects.toBeInstanceOf(NodePublicationRejected);
  expect(failedSaves).toBe(0);
  expect((await nodes.snapshot()).get('tool-question')).toBeUndefined();
  raw.close();
});

test('a stopped Agent retries its original authorized Question after uncertain publication without replay', async () => {
  const raw = memoryNodeBackend();
  const setup = createApplicationIdentities(transactionFixture(raw));
  await setup.ensure();
  await raw.commit({
    ...request('source', [
      create('source', { kind: 'content', text: 'The garden wall gets morning light.' }),
    ]),
    recordedBy: setup.identities.user,
  });
  const entered: string[] = [];
  let failed = false;
  const transport = {
    ...raw,
    commit: (...args: Parameters<typeof raw.commit>) => {
      if (args[0].changes.some((change) => change.data?.kind === 'question')) {
        entered.push(canonical(args[0]));
        if (!failed) {
          failed = true;
          return Promise.reject(new Error('Uncertain Question publication'));
        }
      }
      return raw.commit(...args);
    },
  };
  const configured = productChatOptions({
    nodes: transactionFixture(transport),
    identities: setup.identities,
    model: async () => previewModel,
    selectedModel: 'fictional',
    provider: 'fictional',
    instructions: '',
  });
  const prepared = await prepareAgentRun(configured.nodes, {
    id: 'start-question',
    run: 'question-run',
    agent: setup.identities.agent,
    recordedBy: setup.identities.user,
    at: '2026-10-13T12:00:00Z',
    provider: 'fictional',
    model: 'fictional',
    settings: {},
    enabledTools: configured.enabledTools,
    context: [],
  });
  let asks = 0;
  const backend = createAgentBackend({
    nodes: configured.nodes,
    writableKinds: configured.writableKinds,
    tools: configured.tools,
    execution: async (input) => {
      asks++;
      await input.tools.askQuestion!.execute!(
        {
          text: 'Which wall?',
          suggestions: [
            { title: 'Garden', text: 'Use the garden wall.', reason: 'Morning light.' },
          ],
          source: { node: 'source', transaction: 'source' },
          knowledge: [],
        },
        { toolCallId: 'ask', messages: [], context: {} },
      );
      return { status: 'complete', text: 'Asked.' };
    },
  });
  const handle = backend.start(prepared);
  await handle.done;
  expect(handle.snapshot().contentPersistence).toBeDefined();
  expect(entered).toHaveLength(1);
  handle.stop();
  await handle.retryContentSave();
  expect(handle.snapshot().contentPersistence).toBeUndefined();
  expect(entered).toHaveLength(2);
  expect(entered[1]).toBe(entered[0]);
  const accepted = await configured.nodes.snapshot();
  const question = accepted.roots().find((node) => node.data?.kind === 'question')!;
  expect(question.data?.suggestions).toHaveLength(1);
  expect(
    accepted
      .children(question.key.node)
      .filter((node) => node.data?.predicate === 'generated-from'),
  ).toHaveLength(1);
  expect(asks).toBe(1);
  await handle.retryContentSave();
  expect(entered).toHaveLength(2);
  backend.dispose();
  raw.close();
});

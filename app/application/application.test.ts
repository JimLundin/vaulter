import { transactionFixture } from '@/vault/transactions/fixtures.test-support.ts';
import { expect, test } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, seed, revise } from '@/vault/nodes/fixtures.test-support.ts';
import { applicationNodeHistory } from './composition.ts';
import { previewModel } from '@/preview/model.ts';
import type { NodeCommit } from '@/vault/nodes/store.ts';

test('Application retains History recovery when the session reading facade changes', async () => {
  const raw = memoryNodeBackend();
  await seed(raw);
  await raw.commit(request('content', [create('content', { kind: 'content', text: 'Retained' })]));
  const attempts: NodeCommit[] = [];
  const nodes = transactionFixture({
    ...raw,
    commit: async (request, publication) => {
      attempts.push(request);
      await raw.commit(request, publication);
      throw new Error('Response lost');
    },
  });
  const identities = { user: 'user', agent: 'agent' };
  const history = applicationNodeHistory(nodes, identities);
  await expect(history.compensate('content')).rejects.toThrow('Response lost');
  const replacement = transactionFixture({
    ...raw,
    commit: (request, publication) => {
      attempts.push(request);
      return raw.commit(request, publication);
    },
  });
  const reopened = applicationNodeHistory(replacement, identities);
  expect(reopened).toBe(history);
  await reopened.compensate('content');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
  expect((await raw.history()).filter(({ undoOf }) => undoOf === 'content')).toHaveLength(1);
});

test('product History compensation preserves producer records and exact evidence while content undo appends history', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(
    request('audit', [
      create('run', { kind: 'agentRun', status: 'running' }),
      create('message', { kind: 'message', role: 'user', text: 'Keep mornings free.' }),
      create('context', { kind: 'contextInput', content: 'Keep mornings free.' }, 'run'),
      {
        ...create('reference', { kind: 'metadataReference', role: 'evidence' }, 'context'),
        connection: {
          source: { node: 'context', transaction: 'audit' },
          target: { node: 'evidence', transaction: 'seed' },
        },
      },
      create('content', { kind: 'content', title: 'Thought', text: 'Before.' }),
    ]),
  );
  const original = (await nodes.snapshot()).get('content')!;
  await nodes.commit(
    request('edit', [
      await revise(nodes, 'content', { kind: 'content', title: 'Thought', text: 'After.' }),
    ]),
  );
  const history = applicationNodeHistory(transactionFixture(nodes), {
    user: 'user',
    agent: 'agent',
  });
  const accepted = await history.compensate('edit');
  expect(accepted.undoOf).toBe('edit');
  expect((await nodes.snapshot()).get('content')?.data).toEqual(original.data);
  expect(
    (await nodes.snapshot()).resolve({ node: 'evidence', transaction: 'seed' })?.data?.text,
  ).toBe('Keep mornings free.');
  await expect(history.compensate('audit')).rejects.toThrow('cannot be undone');
  await nodes.commit(
    request('retag', [
      await revise(nodes, 'run', { kind: 'content', title: 'Retagged', text: 'Audit.' }),
    ]),
  );
  await expect(history.compensate('retag')).rejects.toThrow('cannot be undone');
});

test('composed Chat and an independent Agent retain attributed generic History after reopen and content compensation', async () => {
  const nodes = memoryNodeBackend();
  const { createApplicationIdentities } = await import('./identities.ts');
  const setup = createApplicationIdentities(transactionFixture(nodes));
  await setup.ensure();
  const { createApplicationConversation } = await import('./composition.ts');
  const { MockLanguageModelV4, convertArrayToReadableStream } = await import('ai/test');
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...(step++ === 0
          ? [
              {
                type: 'tool-call' as const,
                toolCallId: 'publish',
                toolName: 'createNode',
                input: JSON.stringify({ title: 'Fictional thought', text: 'Keep mornings free.' }),
              },
            ]
          : [
              { type: 'text-start' as const, id: 't' },
              { type: 'text-delta' as const, id: 't', delta: 'Saved in nodes.' },
              { type: 'text-end' as const, id: 't' },
            ]),
        {
          type: 'finish',
          finishReason: { unified: step === 1 ? 'tool-calls' : 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
        },
      ]),
    }),
  });
  const options = {
    nodes,
    identities: setup.identities,
    model: async () => model,
    selectedModel: 'fictional',
    provider: 'fictional',
    instructions: 'Record the supplied thought.',
  };
  const chat = createApplicationConversation(options);
  const outcome = chat.prepareSubmission({ text: 'Remember the fictional morning.' });
  if (outcome.status !== 'owned') throw new Error('Expected retained request');
  await outcome.done;
  const history = applicationNodeHistory(transactionFixture(nodes), setup.identities);
  const entries = await history.entries();
  const publication = entries.find(({ differences }) =>
    differences.some(({ after }) => after.data?.kind === 'content'),
  )!;
  expect(publication.author.key.node).toBe(setup.identities.agent);
  expect(publication.origin?.data?.kind).toBe('agentRun');
  expect(
    entries.flatMap(({ differences }) => differences.map(({ after }) => after.data?.kind)),
  ).toEqual(
    expect.arrayContaining([
      'conversation',
      'exchange',
      'message',
      'agentRun',
      'contextInput',
      'toolExecution',
      'content',
    ]),
  );
  const cutoff = await nodes.snapshot(publication.transaction.sequence);
  const content = publication.differences[0]!.after;
  expect(cutoff.get(content.key.node)?.data?.text).toBe('Keep mornings free.');
  await history.compensate(publication.transaction.id);
  expect((await nodes.snapshot()).get(content.key.node)?.data).toBeNull();
  expect((await nodes.snapshot()).resolve(content.key)?.data?.text).toBe('Keep mornings free.');
  const beforeRead = (await nodes.history()).length;
  const reopened = createApplicationConversation({
    ...options,
    model: () => Promise.reject(new Error('Reading must not execute')),
  });
  await reopened.open(chat.conversation());
  expect(reopened.snapshot().turns[1]?.parts).toEqual(
    expect.arrayContaining([{ kind: 'text', text: 'Saved in nodes.' }]),
  );
  expect((await nodes.history()).length).toBe(beforeRead);
  expect(model.doStreamCalls).toHaveLength(2);
  const { prepareAgentRunFixture: prepareAgentRun } = await import(
    '@/agent/preparation.test-support.ts'
  );
  const { createAgentBackend } = await import('@/agent/runtime.ts');
  const standalone = await prepareAgentRun(transactionFixture(nodes), {
    id: 'independent',
    run: 'standalone',
    recordedBy: setup.identities.user,
    agent: setup.identities.agent,
    at: '2026-10-10T12:00:00Z',
    provider: 'fictional',
    model: 'fictional',
    settings: {},
    context: [
      {
        data: {
          kind: 'contextInput',
          position: 0,
          role: 'user',
          transformation: 'verbatim',
          content: 'An independent task.',
        },
      },
    ],
  });
  await createAgentBackend({ nodes: transactionFixture(nodes), model: async () => model }).start(
    standalone,
  ).done;
  const independent = (await history.entries()).find(
    ({ transaction }) => transaction.id === standalone.commit.id,
  )!;
  expect(independent.differences.some(({ after }) => after.data?.kind === 'conversation')).toBe(
    false,
  );
  expect(independent.differences.some(({ after }) => after.data?.kind === 'agentRun')).toBe(true);
  chat.dispose();
  reopened.dispose();
});

test('History refuses mixed, deleted and retagged execution or transcript transactions atomically', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(
    request('records', [
      create('run', { kind: 'agentRun' }),
      create('message', { kind: 'message' }),
      create('tool', { kind: 'toolExecution' }, 'run'),
      create('context', { kind: 'contextInput' }, 'run'),
      create('reference', { kind: 'metadataReference', role: 'suppliedContext' }, 'context'),
      create('content', { kind: 'content', title: 'Thought', text: 'Before.' }),
    ]),
  );
  const history = applicationNodeHistory(transactionFixture(nodes), {
    user: 'user',
    agent: 'agent',
  });
  await nodes.commit(
    request('mixed', [
      await revise(nodes, 'content', { kind: 'content', title: 'Thought', text: 'After.' }),
      await revise(nodes, 'tool', null),
    ]),
  );
  const before = (await nodes.history()).length;
  await expect(history.compensate('mixed')).rejects.toThrow('cannot be undone');
  expect((await nodes.history()).length).toBe(before);
  for (const node of ['message', 'context', 'reference']) {
    await nodes.commit(request(`delete-${node}`, [await revise(nodes, node, null)]));
    await expect(history.compensate(`delete-${node}`)).rejects.toThrow('cannot be undone');
  }
});

test('Application agent asks an EAV Question and reopens its accepted receipt without execution', async () => {
  const { createMemoryStorage } = await import('@/vault/eav/index.ts');
  const { applicationWiki, createApplicationConversation } = await import('./composition.ts');
  const { seedEavWiki } = await import('@/preview/wiki-records.ts');
  const { readEavQuestions } = await import('@/workflows/questions/data/reading.ts');
  const storage = createMemoryStorage();
  const db = await applicationWiki(storage).database();
  await seedEavWiki(db);
  const transport = memoryNodeBackend();
  const { createApplicationIdentities } = await import('./identities.ts');
  const setup = createApplicationIdentities(transactionFixture(transport));
  await setup.ensure();
  const options = {
    nodes: transport,
    eav: storage,
    model: async () => previewModel,
    selectedModel: 'fictional',
    provider: 'fictional',
    instructions: 'Retain questions about the Garden studio.',
  };
  const chat = createApplicationConversation(options);
  const reopened = createApplicationConversation({
    ...options,
    model: () => Promise.reject(new Error('Reading must not execute the agent')),
  });
  try {
    const outcome = chat.prepareSubmission({ text: 'ask me: Where should the bench go?' });
    if (outcome.status !== 'owned') throw new Error('Expected retained request');
    await outcome.done;
    const question = (await readEavQuestions(db))[0]!;
    expect(question, JSON.stringify(chat.snapshot())).toBeDefined();
    expect(question.data).toMatchObject({
      text: 'Where should the bench go?',
      suggestions: expect.arrayContaining([
        expect.objectContaining({ title: 'Prioritise morning work' }),
      ]),
    });
    expect(question.sources?.[0]?.text).toBe('ask me: Where should the bench go?');
    expect(question.subjects[0]?.href).toBe('#/wiki/preview%3Apage%3A0/');
    expect(question.created?.author?.type).toBe('actor');
    expect(question.created?.origin?.type).toBe('agent.run');
    const receipt = {
      question: question.id,
      transaction: question.evidence.transaction,
      accepted: true,
    };
    expect(chat.snapshot().turns.flatMap(({ parts }) => parts)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tool',
          name: 'askQuestion',
          output: receipt,
          status: 'complete',
        }),
      ]),
    );
    await reopened.open(chat.conversation());
    expect(reopened.snapshot().turns.flatMap(({ parts }) => parts)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'tool', name: 'askQuestion', output: receipt }),
      ]),
    );
    expect(await readEavQuestions(db)).toHaveLength(1);
  } finally {
    chat.dispose();
    reopened.dispose();
    transport.close();
  }
});

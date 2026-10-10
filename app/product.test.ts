import { expect, test } from 'vitest';
import { memoryNodeBackend } from './vault/nodes/memory.ts';
import { create, request, seed, revise } from './vault/nodes/fixtures.test-support.ts';
import { productNodeHistory } from './product.tsx';

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
  const history = productNodeHistory(nodes);
  const accepted = await nodes.commit(
    await history.prepareUndo({ transaction: 'edit', recordedBy: 'user', id: 'undo' }),
  );
  expect(accepted.undoOf).toBe('edit');
  expect((await nodes.snapshot()).get('content')?.data).toEqual(original.data);
  expect(
    (await nodes.snapshot()).resolve({ node: 'evidence', transaction: 'seed' })?.data?.text,
  ).toBe('Keep mornings free.');
  await expect(
    history.prepareUndo({ transaction: 'audit', recordedBy: 'user', id: 'erase' }),
  ).rejects.toThrow('cannot be undone');
  await nodes.commit(
    request('retag', [
      await revise(nodes, 'run', { kind: 'content', title: 'Retagged', text: 'Audit.' }),
    ]),
  );
  await expect(
    history.prepareUndo({ transaction: 'retag', recordedBy: 'user', id: 'erase-retag' }),
  ).rejects.toThrow('cannot be undone');
});

test('composed Chat and an independent Agent retain attributed generic History after reopen and content compensation', async () => {
  const nodes = memoryNodeBackend();
  const { createApplicationIdentities } = await import('./application-identities.ts');
  const setup = createApplicationIdentities(nodes);
  await setup.ensure();
  const { createProductConversation } = await import('./product.tsx');
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
  const chat = createProductConversation(options);
  await chat.send('Remember the fictional morning.');
  const history = productNodeHistory(nodes);
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
  await nodes.commit(
    await history.prepareUndo({
      transaction: publication.transaction.id,
      recordedBy: setup.identities.user,
      id: 'undo-content',
    }),
  );
  expect((await nodes.snapshot()).get(content.key.node)?.data).toBeNull();
  expect((await nodes.snapshot()).resolve(content.key)?.data?.text).toBe('Keep mornings free.');
  const beforeRead = (await nodes.history()).length;
  const reopened = createProductConversation({
    ...options,
    model: () => Promise.reject(new Error('Reading must not execute')),
  });
  await reopened.open(chat.conversation());
  expect(reopened.snapshot().turns[1]?.parts).toEqual(
    expect.arrayContaining([{ kind: 'text', text: 'Saved in nodes.' }]),
  );
  expect((await nodes.history()).length).toBe(beforeRead);
  expect(model.doStreamCalls).toHaveLength(2);
  const { prepareAgentRun } = await import('./agent/store.ts');
  const { createAgentBackend } = await import('./agent/runtime.ts');
  const standalone = await prepareAgentRun(nodes, {
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
  await createAgentBackend({ nodes, model: async () => model }).start(standalone).done;
  const independent = (await history.entries()).find(
    ({ transaction }) => transaction.id === 'independent',
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
  const history = productNodeHistory(nodes);
  await nodes.commit(
    request('mixed', [
      await revise(nodes, 'content', { kind: 'content', title: 'Thought', text: 'After.' }),
      await revise(nodes, 'tool', null),
    ]),
  );
  const before = (await nodes.history()).length;
  await expect(
    history.prepareUndo({ transaction: 'mixed', recordedBy: 'user', id: 'undo-mixed' }),
  ).rejects.toThrow('cannot be undone');
  expect((await nodes.history()).length).toBe(before);
  for (const node of ['message', 'context', 'reference']) {
    await nodes.commit(request(`delete-${node}`, [await revise(nodes, node, null)]));
    await expect(
      history.prepareUndo({
        transaction: `delete-${node}`,
        recordedBy: 'user',
        id: `undo-${node}`,
      }),
    ).rejects.toThrow('cannot be undone');
  }
});

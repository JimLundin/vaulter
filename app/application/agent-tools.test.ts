import { contentEnabledTools } from '../vault/content/tool-actions.ts';
import { transactionFixture } from '../vault/transactions/fixtures.test-support.ts';
import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { AgentToolContext } from '../agent/tools.ts';
import { createAgentBackend } from '../agent/runtime.ts';
import { readAgentRun } from '../agent/store.ts';
import { prepareAgentRunFixture as prepareAgentRun } from '../agent/preparation.test-support.ts';
import { create, request, revise } from '../vault/nodes/fixtures.test-support.ts';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { readQuestions } from '../workflows/questions/reading.ts';
import { createApplicationTools, applicationNodes, agentContextReading } from './composition.ts';
import type { AgentContextReading } from '../agent/discovery.ts';
import { listWikiSubjects } from '../workflows/wiki/subjects.ts';

const execution = { toolCallId: 'question-call', messages: [], context: {} };
const proposals = {
  suggestions: [
    {
      title: 'Garden wall',
      text: 'Use the garden wall.',
      reason: 'The source describes its morning light.',
    },
  ],
  source: { node: 'source', transaction: 'setup' },
  knowledge: [],
};
const source = () =>
  create('source', { kind: 'content', text: 'The garden wall gets the morning light.' });
const reading: AgentContextReading = {
  subjects: listWikiSubjects,
  text: agentContextReading.text,
  title: (node) => String(node.data?.title ?? 'Source'),
  isKnowledge: (node) => node.data?.kind === 'run',
};
const questionTools = (context: AgentToolContext, nodes: ReturnType<typeof memoryNodeBackend>) =>
  createApplicationTools(
    { author: { recordedBy: 'agent', origin: 'run' }, ...context },
    applicationNodes(nodes),
    reading,
  );

test('Questions agent discovery and reads include retained Questions and exact direct Answer text', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('section', { kind: 'section' }, 'page'),
      create('detached', { kind: 'section' }),
      create('question', { kind: 'question', text: 'Which wall?' }, 'page'),
      create('answer', { kind: 'answer', text: 'The garden wall.' }, 'question'),
      create('source', { kind: 'content', text: 'An independent source.' }),
      {
        ...create('answered-by', { kind: 'relationship', predicate: 'answered-by' }, 'source'),
        connection: {
          source: { node: 'question' },
          target: { node: 'answer', transaction: 'setup' },
        },
      },
    ]),
  );
  let view = await nodes.snapshot();
  const context: AgentToolContext = {
    signal: new AbortController().signal,
    snapshot: () => view,
    write: () => Promise.reject(new Error('Reads must not publish')),
  };
  const tools = questionTools(context, nodes);
  expect(await tools.listQuestionSubjects.execute!({}, execution)).toEqual([
    { node: 'page', title: 'Studio', kind: 'page' },
    { node: 'section', title: 'Studio', kind: 'section' },
  ]);
  expect(await tools.readQuestion.execute!({ node: 'question' }, execution)).toMatchObject({
    question: 'question',
    status: 'answered',
    answers: [
      { node: 'answer', transaction: 'setup', text: 'The garden wall.', state: 'available' },
    ],
  });
  await nodes.commit(request('removed-subject', [await revise(nodes, 'page', null)]));
  await nodes.commit(request('removed-answer', [await revise(nodes, 'answer', null)]));
  view = await nodes.snapshot();
  expect(await tools.listQuestions.execute!({}, execution)).toMatchObject([
    {
      question: 'question',
      status: 'answered',
      subjects: [{ node: 'page', state: 'deleted' }],
      answers: [{ text: 'The garden wall.', state: 'deleted' }],
    },
  ]);
  await expect(tools.readQuestion.execute!({ node: 'missing' }, execution)).rejects.toThrow(
    'Question not found',
  );
  nodes.close();
});

test('an expired Questions tool cannot publish a request', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(request('setup', [create('user', { kind: 'actor' })]));
  const view = await nodes.snapshot();
  const stopped = new AbortController();
  stopped.abort();
  let publications = 0;
  const tools = questionTools(
    {
      signal: stopped.signal,
      snapshot: () => view,
      write: () => {
        publications++;
        return Promise.resolve('unexpected');
      },
    },
    nodes,
  );
  await expect(
    tools.askQuestion.execute!({ ...proposals, text: 'Which wall?' }, execution),
  ).rejects.toThrow();
  expect(publications).toBe(0);
  nodes.close();
});

test('Question creation requires trusted invocation attribution before source reads or publication', async () => {
  const nodes = memoryNodeBackend();
  const tools = createApplicationTools(
    {
      signal: new AbortController().signal,
      snapshot: () => {
        throw new Error('An untrusted invocation must not read.');
      },
      write: () => Promise.reject(new Error('An untrusted invocation must not publish.')),
    },
    applicationNodes(nodes),
    reading,
  );
  await expect(
    tools.askQuestion.execute!({ ...proposals, text: 'Which wall?' }, execution),
  ).rejects.toThrow('trusted Agent invocation');
  nodes.close();
});

test('subject discovery retains its captured snapshot and guards each live ancestor before a later ask', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      source(),
      create('container', { kind: 'content', text: 'Wiki collection.' }),
      create('page', { kind: 'page', title: 'Studio' }, 'container'),
      create('section', { kind: 'section' }, 'page'),
    ]),
  );
  const view = await nodes.snapshot();
  await nodes.commit(
    request('later-page', [create('later', { kind: 'page', title: 'Later subject' })]),
  );
  const expectedReads: Record<string, string> = {};
  const tracked = {
    ...view,
    get: (node: string) => {
      const version = view.get(node);
      if (version) expectedReads[node] = version.key.transaction;
      return version;
    },
  };
  const tools = questionTools(
    {
      signal: new AbortController().signal,
      snapshot: () => tracked,
      write: async (calculate) => {
        const id = crypto.randomUUID();
        const prepared = await calculate(id);
        return (
          await nodes.commit({
            ...prepared,
            id,
            expectedReads: { ...prepared.expectedReads, ...expectedReads },
            recordedBy: 'user',
            origin: null,
            undoOf: null,
          })
        ).id;
      },
    },
    nodes,
  );
  expect(await tools.listQuestionSubjects.execute!({}, execution)).toEqual([
    { node: 'page', title: 'Studio', kind: 'page' },
    { node: 'section', title: 'Studio', kind: 'section' },
  ]);
  await nodes.commit(request('removed-container', [await revise(nodes, 'container', null)]));
  await expect(
    tools.askQuestion.execute!({ ...proposals, text: 'Where should the bench go?' }, execution),
  ).rejects.toThrow('Conflict');
  expect(await readQuestions(nodes)).toEqual([]);
  nodes.close();
});

test('Agent presents a Question with a durable accepted receipt, trusted attribution and no replay on reopening', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      source(),
      create('agent', { kind: 'agent', name: 'Fictional Agent' }),
      create('page', { kind: 'page', title: 'Studio' }),
    ]),
  );
  const prepared = await prepareAgentRun(transactionFixture(nodes), {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-13T12:00:00Z',
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 2 },
    enabledTools: [
      ...contentEnabledTools,
      ...[
        'askQuestion',
        'listQuestionSubjects',
        'listQuestionContext',
        'readQuestion',
        'listQuestions',
      ].map((name) => ({ name })),
    ],
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Ask where the bench belongs.',
        },
      },
    ],
  });
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...(step++ === 0
          ? [
              {
                type: 'tool-call' as const,
                toolCallId: 'question-call',
                toolName: 'askQuestion',
                input: JSON.stringify({
                  ...proposals,
                  text: 'Where should the bench go?',
                  subject: 'page',
                }),
              },
            ]
          : [
              { type: 'text-start' as const, id: 'text' },
              { type: 'text-delta' as const, id: 'text', delta: 'I saved the question.' },
              { type: 'text-end' as const, id: 'text' },
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
  const tools = (context: AgentToolContext) => questionTools(context, nodes);
  const backend = createAgentBackend({
    nodes: transactionFixture(nodes),
    model: async () => model,
    tools,
    writableKinds: ['question', 'relationship'],
  });
  const outcome = await backend.start(prepared).done;
  expect(outcome.phase, JSON.stringify(outcome)).toBe('complete');
  const [question] = await readQuestions(nodes);
  expect(question).toMatchObject({
    status: 'open',
    data: { text: 'Where should the bench go?' },
    subject: { address: { node: 'page' } },
    created: { author: { node: 'agent' }, origin: { node: 'run' } },
  });
  const saved = await readAgentRun(nodes, 'run');
  expect(saved?.tools[0]?.data).toMatchObject({
    status: 'complete',
    input: { ...proposals, text: 'Where should the bench go?', subject: 'page' },
    output: { question: question.id, transaction: question.key.transaction, accepted: true },
  });
  const before = (await nodes.history()).length;
  const reopened = createAgentBackend({
    nodes: transactionFixture(nodes),
    tools,
    model: () => Promise.reject(new Error('Must not execute')),
  });
  expect((await reopened.start(prepared).done).phase).toBe('complete');
  expect((await nodes.history()).length).toBe(before);
  expect(await readQuestions(nodes)).toHaveLength(1);
  expect(model.doStreamCalls).toHaveLength(2);
  nodes.close();
});

test('Agent can discover subjects and retained questions between consecutive accepted asks', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      source(),
      create('agent', { kind: 'agent', name: 'Fictional Agent' }),
      create('container', { kind: 'content', text: 'Wiki collection.' }),
      create('page', { kind: 'page', title: 'Studio' }, 'container'),
      create('section', { kind: 'section' }, 'page'),
    ]),
  );
  const prepared = await prepareAgentRun(transactionFixture(nodes), {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-13T12:00:00Z',
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 6 },
    enabledTools: [
      ...contentEnabledTools,
      ...[
        'askQuestion',
        'listQuestionSubjects',
        'listQuestionContext',
        'listQuestions',
        'readQuestion',
      ].map((name) => ({ name })),
    ],
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Ask about the bench and its tools.',
        },
      },
    ],
  });
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const [question] = await readQuestions(nodes);
      const calls = [
        {
          name: 'askQuestion',
          input: { ...proposals, text: 'Where should the bench go?', subject: 'section' },
        },
        { name: 'listQuestionSubjects', input: {} },
        { name: 'listQuestions', input: {} },
        { name: 'readQuestion', input: { node: question?.id } },
        {
          name: 'askQuestion',
          input: { ...proposals, text: 'Which tools should stay?', subject: 'page' },
        },
      ];
      const call = calls[step++];
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          ...(call
            ? [
                {
                  type: 'tool-call' as const,
                  toolCallId: `question-call-${step}`,
                  toolName: call.name,
                  input: JSON.stringify(call.input),
                },
              ]
            : [
                { type: 'text-start' as const, id: 'text' },
                { type: 'text-delta' as const, id: 'text', delta: 'I saved both questions.' },
                { type: 'text-end' as const, id: 'text' },
              ]),
          {
            type: 'finish',
            finishReason: { unified: call ? 'tool-calls' : 'stop', raw: undefined },
            usage: {
              inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 0, text: 0, reasoning: 0 },
            },
          },
        ]),
      };
    },
  });
  const backend = createAgentBackend({
    nodes: transactionFixture(nodes),
    model: async () => model,
    tools: (context) => questionTools(context, nodes),
    writableKinds: ['question', 'relationship'],
  });
  const state = await backend.start(prepared).done;
  expect(state.phase, JSON.stringify(state)).toBe('complete');
  expect(state.contentPersistence).toBeUndefined();
  expect(
    (await readQuestions(nodes))
      .map((question) => question.data.text)
      .sort((first, second) => first.localeCompare(second)),
  ).toEqual(['Where should the bench go?', 'Which tools should stay?']);
  const saved = await readAgentRun(nodes, 'run');
  expect(saved?.tools.map(({ data }) => data.status)).toEqual(new Array(5).fill('complete'));
  expect(saved?.tools[1]?.data.output).toEqual([
    { node: 'page', title: 'Studio', kind: 'page' },
    { node: 'section', title: 'Studio', kind: 'section' },
  ]);
  nodes.close();
});

test('context discovery returns captured source and knowledge text without publishing or tracking unrelated activity', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      source(),
      create('knowledge', { kind: 'run', text: 'Light matters for fine work.' }),
      create('run', { kind: 'agentRun' }),
      create('tool', { kind: 'toolExecution', text: 'Mutable tool activity.' }, 'run'),
    ]),
  );
  const view = await nodes.snapshot();
  const commit = () => Promise.reject(new Error('Discovery must not publish.'));
  const tools = questionTools(
    {
      signal: new AbortController().signal,
      snapshot: () => ({
        ...view,
        get: () => {
          throw new Error('Discovery must not track unrelated records.');
        },
        children: () => {
          throw new Error('Discovery must not track unrelated records.');
        },
        roots: () => {
          throw new Error('Discovery must not track unrelated records.');
        },
      }),
      write: commit,
    },
    nodes,
  );
  await nodes.commit(request('later', [create('new', { kind: 'content', text: 'Later light.' })]));
  expect(await tools.listQuestionContext.execute!({ query: 'light' }, execution)).toEqual({
    sources: [
      {
        node: 'source',
        transaction: 'setup',
        title: 'Source',
        text: 'The garden wall gets the morning light.',
      },
    ],
    knowledge: [
      {
        node: 'knowledge',
        transaction: 'setup',
        title: 'Source',
        text: 'Light matters for fine work.',
      },
    ],
  });
  nodes.close();
});

test('asking requires grounded proposals and rejects a Wiki passage used as the original source', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      source(),
      create('wiki', { kind: 'run', text: 'Existing knowledge.' }),
    ]),
  );
  const commit = () => Promise.reject(new Error('Invalid proposals must not publish.'));
  const tools = questionTools(
    {
      signal: new AbortController().signal,
      snapshot: () => {
        throw new Error('Schema must reject incomplete input first.');
      },
      write: commit,
    },
    nodes,
  );
  const incomplete = { text: 'Where?' } as Parameters<
    NonNullable<typeof tools.askQuestion.execute>
  >[0];
  await expect(tools.askQuestion.execute!(incomplete, execution)).rejects.toThrow();
  const validated = questionTools(
    {
      signal: new AbortController().signal,
      snapshot: () => view,
      write: async (calculate) => {
        await calculate(crypto.randomUUID());
        return commit();
      },
    },
    nodes,
  );
  const view = await nodes.snapshot();
  await expect(
    validated.askQuestion.execute!(
      { ...proposals, text: 'Where?', source: { node: 'wiki', transaction: 'setup' } },
      execution,
    ),
  ).rejects.toThrow('retained source material');
  nodes.close();
});

test('Agent composition admits only current self-contained source and knowledge selections', async () => {
  const raw = memoryNodeBackend();
  await raw.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      source(),
      create('page', { kind: 'page', title: 'Studio' }),
      create('knowledge', { kind: 'run', text: 'Keep the morning light.' }, 'page'),
    ]),
  );
  const view = await raw.snapshot();
  let writes = 0;
  const tools = createApplicationTools(
    {
      signal: new AbortController().signal,
      author: { recordedBy: 'agent', origin: 'run' },
      snapshot: () => view,
      write: async (calculate) => {
        await calculate('invalid-selection');
        writes++;
        throw new Error('Invalid selections must not write');
      },
    },
    applicationNodes(raw),
  );
  for (const input of [
    { ...proposals, source: { node: 'knowledge', transaction: 'setup' } },
    { ...proposals, source: { node: 'page', transaction: 'setup' } },
    { ...proposals, source: { node: 'source', transaction: 'missing' } },
    { ...proposals, knowledge: [proposals.source] },
  ])
    await expect(
      tools.askQuestion.execute!({ ...input, text: 'Which wall?' }, execution),
    ).rejects.toThrow(/source|context|knowledge/i);
  expect(writes).toBe(0);
  raw.close();
});

test('Agent grounding retains foreign ancestor reads through atomic Question acceptance', async () => {
  const { agentContentContext } = await import('../agent/tool-context.ts');
  const raw = memoryNodeBackend();
  await raw.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('agent', { kind: 'agent' }),
      create('run', { kind: 'agentRun' }),
      source(),
      create('page', { kind: 'page', title: 'Studio' }),
      create('knowledge', { kind: 'run', text: 'Keep the morning light.' }, 'page'),
    ]),
  );
  const nodes = applicationNodes(raw);
  const owner = agentContentContext({
    nodes,
    agent: 'agent',
    run: 'run',
    signal: new AbortController().signal,
    live: () => true,
    executing: () => true,
    writableKinds: ['question', 'relationship'],
    snapshot: await nodes.snapshot(),
    publicationFailed: () => {},
    refreshFailed: () => {},
  });
  const tools = createApplicationTools(
    {
      ...owner.context,
      write: (calculate) =>
        owner.context.write(async (id) => {
          const prepared = await calculate(id);
          await raw.commit(request('removed-page', [await revise(raw, 'page', null)]));
          return prepared;
        }),
    },
    nodes,
  );
  await expect(
    tools.askQuestion.execute!(
      {
        ...proposals,
        text: 'Which wall?',
        knowledge: [{ node: 'knowledge', transaction: 'setup' }],
      },
      execution,
    ),
  ).rejects.toThrow('Conflict');
  expect(await readQuestions(nodes)).toEqual([]);
  await owner.settle();
  raw.close();
});

test('queued Agent creation classifies evidence in the Snapshot used to prepare the Question', async () => {
  const raw = memoryNodeBackend();
  await raw.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      source(),
      create('page', { kind: 'page', title: 'Studio' }),
      create('knowledge', { kind: 'run', text: 'Keep the morning light.' }, 'page'),
    ]),
  );
  let view = await raw.snapshot();
  let prepared = false;
  const tools = createApplicationTools(
    {
      author: { recordedBy: 'agent', origin: 'run' },
      signal: new AbortController().signal,
      snapshot: () => view,
      write: async (calculate) => {
        // An earlier queued write or refresh changes classification before this calculation starts.
        await raw.commit(request('retag-page', [await revise(raw, 'page', { kind: 'content' })]));
        view = await raw.snapshot();
        await calculate('queued-question');
        prepared = true;
        throw new Error('No Question should be prepared from invalidated knowledge');
      },
    },
    applicationNodes(raw),
  );
  await expect(
    tools.askQuestion.execute!(
      {
        ...proposals,
        text: 'Which wall?',
        knowledge: [{ node: 'knowledge', transaction: 'setup' }],
      },
      execution,
    ),
  ).rejects.toThrow('Existing knowledge must be Wiki text');
  expect(prepared).toBe(false);
  expect(await readQuestions(raw)).toEqual([]);
  raw.close();
});

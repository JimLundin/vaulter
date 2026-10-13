import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { AgentToolContext } from '../../agent/tools.ts';
import { createAgentBackend } from '../../agent/runtime.ts';
import { prepareAgentRun, readAgentRun } from '../../agent/store.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { readQuestions } from './reading.ts';
import { questionTools } from './tools.ts';

const execution = { toolCallId: 'question-call', messages: [], context: {} };

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
    commit: () => Promise.reject(new Error('Reads must not publish')),
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
      commit: () => {
        publications++;
        return Promise.resolve('unexpected');
      },
    },
    nodes,
  );
  await expect(tools.askQuestion.execute!({ text: 'Which wall?' }, execution)).rejects.toThrow();
  expect(publications).toBe(0);
  nodes.close();
});

test('subject discovery retains its captured snapshot and guards each live ancestor before a later ask', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
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
      commit: async (prepared) =>
        (
          await nodes.commit({
            ...prepared,
            expectedReads: { ...prepared.expectedReads, ...expectedReads },
            recordedBy: 'user',
            origin: null,
            undoOf: null,
          })
        ).id,
    },
    nodes,
  );
  expect(await tools.listQuestionSubjects.execute!({}, execution)).toEqual([
    { node: 'page', title: 'Studio', kind: 'page' },
    { node: 'section', title: 'Studio', kind: 'section' },
  ]);
  await nodes.commit(request('removed-container', [await revise(nodes, 'container', null)]));
  await expect(
    tools.askQuestion.execute!({ text: 'Where should the bench go?' }, execution),
  ).rejects.toThrow('Conflict');
  expect(await readQuestions(nodes)).toEqual([]);
  nodes.close();
});

test('Agent presents a Question with a durable accepted receipt, trusted attribution and no replay on reopening', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('agent', { kind: 'agent', name: 'Fictional Agent' }),
      create('page', { kind: 'page', title: 'Studio' }),
    ]),
  );
  const prepared = await prepareAgentRun(nodes, {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-13T12:00:00Z',
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 2 },
    enabledTools: ['askQuestion', 'listQuestionSubjects', 'readQuestion', 'listQuestions'].map(
      (name) => ({ name }),
    ),
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
                input: JSON.stringify({ text: 'Where should the bench go?', subject: 'page' }),
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
    nodes,
    model: async () => model,
    tools,
    writableKinds: ['question'],
  });
  expect((await backend.start(prepared).done).phase).toBe('complete');
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
    input: { text: 'Where should the bench go?', subject: 'page' },
    output: { question: question.id, transaction: question.key.transaction, accepted: true },
  });
  const before = (await nodes.history()).length;
  const reopened = createAgentBackend({
    nodes,
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
      create('agent', { kind: 'agent', name: 'Fictional Agent' }),
      create('container', { kind: 'content', text: 'Wiki collection.' }),
      create('page', { kind: 'page', title: 'Studio' }, 'container'),
      create('section', { kind: 'section' }, 'page'),
    ]),
  );
  const prepared = await prepareAgentRun(nodes, {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-13T12:00:00Z',
    provider: 'fictional',
    model: 'fictional',
    settings: { maxSteps: 6 },
    enabledTools: ['askQuestion', 'listQuestionSubjects', 'listQuestions', 'readQuestion'].map(
      (name) => ({ name }),
    ),
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
        { name: 'askQuestion', input: { text: 'Where should the bench go?', subject: 'section' } },
        { name: 'listQuestionSubjects', input: {} },
        { name: 'listQuestions', input: {} },
        { name: 'readQuestion', input: { node: question?.id } },
        { name: 'askQuestion', input: { text: 'Which tools should stay?', subject: 'page' } },
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
    nodes,
    model: async () => model,
    tools: (context) => questionTools(context, nodes),
    writableKinds: ['question'],
  });
  const state = await backend.start(prepared).done;
  expect(state.phase).toBe('complete');
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

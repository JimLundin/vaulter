import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { NodePublicationRejected } from '../../vault/nodes/history.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import type { JsonObject } from '../../vault/nodes/model.ts';
import type {
  NodeBackend,
  NodeCommit,
  NodePublicationRule,
  NodeStore,
} from '../../vault/nodes/store.ts';
import { fakeGitHub } from '../../vault/storage/github-client/fake-github.ts';
import { githubNodeBackend } from '../../vault/storage/nodes/github.ts';
import {
  createQuestionOwnership,
  type AskQuestionInput,
  type QuestionContextReading,
  type QuestionWriter,
} from './actions.ts';
import { prepareAskQuestion, type QuestionCommit } from './operations.ts';
import { readQuestions } from './reading.ts';

const agent: Omit<QuestionWriter, 'id'> = { kind: 'agent', recordedBy: 'agent', origin: 'context' };
const person: Omit<QuestionWriter, 'id'> = { kind: 'person', recordedBy: 'user', origin: null };
const reading: QuestionContextReading = {
  text: (node) => (typeof node.data?.text === 'string' ? node.data.text : undefined),
  isKnowledge: (node) => node.data?.kind === 'run',
  title: () => 'Retained source',
};
const input: AskQuestionInput = {
  text: '  Which wall?  ',
  subject: 'page',
  suggestions: [
    { title: 'Garden', text: 'Use the garden wall.', reason: 'It receives morning light.' },
  ],
  source: { node: 'source', transaction: 'setup' },
  knowledge: [{ node: 'knowledge', transaction: 'setup' }],
};
const attributed = (prepared: QuestionCommit, writer = agent): NodeCommit => ({
  ...prepared,
  recordedBy: writer.recordedBy,
  origin: writer.origin,
  undoOf: null,
});

function initialRecords() {
  return request('setup', [
    create('user', { kind: 'actor' }),
    create('agent', { kind: 'agent', name: 'Fictional agent' }),
    create('context', { kind: 'content', text: 'Ask about the bench.' }),
    create('page', { kind: 'page', title: 'Studio' }),
    create('source', { kind: 'content', text: 'The garden wall receives morning light.' }),
    create('knowledge', { kind: 'run', text: 'Light matters for fine work.' }),
    create('foreign', { kind: 'content', text: 'Independent source material.' }),
  ]);
}

async function fixture() {
  const raw = memoryNodeBackend();
  await raw.commit(initialRecords());
  const actions = createQuestionOwnership({ nodes: raw, reading });
  const nodes: NodeStore = {
    ...raw,
    commit: (value) => raw.commit(value, actions.publication),
  };
  return { raw, nodes, actions };
}

test('Questions actions construct and authorize complete grounded Questions and direct Answers', async () => {
  const { raw, nodes, actions } = await fixture();
  const asked = actions.ask(await nodes.snapshot(), input, { ...agent, id: crypto.randomUUID() });
  expect(asked.changes).toHaveLength(3);
  expect(asked.expectedReads).toMatchObject({ source: 'setup', knowledge: 'setup', page: 'setup' });
  await nodes.commit(structuredClone(attributed(asked)));
  const [question] = await readQuestions(nodes);
  expect(question).toMatchObject({
    data: { text: 'Which wall?', suggestions: input.suggestions },
    status: 'open',
    sources: [{ address: input.source }],
    knowledge: [{ address: input.knowledge[0] }],
    created: { author: { node: 'agent' }, origin: { node: 'context' } },
  });
  const answered = await actions.answer(
    await nodes.snapshot(),
    { question: question.key, text: '  The garden wall.  ' },
    { ...person, id: crypto.randomUUID() },
  );
  expect(answered.changes).toHaveLength(3);
  expect(answered.expectedReads).toMatchObject({ [question.id]: asked.id });
  await nodes.commit(structuredClone(attributed(answered, person)));
  expect((await readQuestions(nodes))[0]).toMatchObject({
    status: 'answered',
    answers: [{ version: { data: { kind: 'answer', text: 'The garden wall.' } } }],
  });
  raw.close();
});

test('Questions actions admit only grounded Agent creation and a person recording the Answer', async () => {
  const { raw, nodes, actions } = await fixture();
  const view = await nodes.snapshot();
  expect(() => actions.ask(view, input, { ...person, id: crypto.randomUUID() })).toThrow(
    'Agent action',
  );
  const invalid = [
    { ...input, suggestions: [] },
    { ...input, source: undefined },
    { ...input, knowledge: undefined },
    { ...input, source: input.knowledge[0] },
    { ...input, knowledge: [input.source] },
    { ...input, subject: 'source' },
  ];
  for (const value of invalid)
    expect(() =>
      actions.ask(view, value as AskQuestionInput, { ...agent, id: crypto.randomUUID() }),
    ).toThrow();
  await expect(
    actions.answer(
      view,
      { question: { node: 'missing', transaction: 'setup' }, text: 'Yes.' },
      { ...agent, id: crypto.randomUUID() },
    ),
  ).rejects.toThrow('Only a person');
  const withoutKnowledge = actions.ask(
    view,
    { ...input, knowledge: [] },
    { ...agent, id: crypto.randomUUID() },
  );
  await nodes.commit(attributed(withoutKnowledge));
  expect((await readQuestions(nodes))[0].knowledge).toEqual([]);
  raw.close();
});

test('the creation action retains foreign ancestry used to admit knowledge with an ordinary Snapshot', async () => {
  const { raw, nodes } = await fixture();
  await raw.commit(
    request('placed-knowledge', [
      {
        ...(await revise(raw, 'knowledge', { kind: 'run', text: 'Light matters for fine work.' })),
        placement: { parent: 'page', order: 'a' },
      },
    ]),
  );
  const actions = createQuestionOwnership({
    nodes: raw,
    reading: {
      ...reading,
      isKnowledge: (node, view) =>
        Boolean(node.placement && view.get(node.placement.parent)?.data?.kind === 'page'),
    },
  });
  const asked = actions.ask(
    await nodes.snapshot(),
    {
      ...input,
      subject: undefined,
      knowledge: [{ node: 'knowledge', transaction: 'placed-knowledge' }],
    },
    { ...agent, id: crypto.randomUUID() },
  );
  expect(asked.expectedReads).toMatchObject({ page: 'setup', knowledge: 'placed-knowledge' });
  await raw.commit(request('removed-knowledge-parent', [await revise(raw, 'page', null)]));
  await expect(raw.commit(attributed(asked), actions.publication)).rejects.toThrow('Conflict');
  expect((await nodes.snapshot()).get(asked.changes[0].node)).toBeUndefined();
  raw.close();
});

test('plausible raw preparation and incomplete Question writes have no action permission', async () => {
  const { raw, nodes } = await fixture();
  const plausible = prepareAskQuestion(await nodes.snapshot(), {
    ...input,
    id: 'forged-preparation',
    node: 'plausible-question',
  });
  await expect(nodes.commit(attributed(plausible))).rejects.toBeInstanceOf(NodePublicationRejected);
  const forged: readonly JsonObject[] = [
    { kind: 'question' },
    { kind: 'question', text: 'Where?' },
    { kind: 'answer', text: 'There.' },
  ];
  await Promise.all(
    forged.map((data) =>
      expect(
        nodes.commit(
          request(`forged-${String(data.kind)}-${String(data.text)}`, [create('forged', data)]),
        ),
      ).rejects.toBeInstanceOf(NodePublicationRejected),
    ),
  );
  expect(await readQuestions(nodes)).toEqual([]);
  raw.close();
});

test('action permission rejects missing, changed, or additional Questions-owned work atomically', async () => {
  const { raw, nodes, actions } = await fixture();
  const asked = attributed(
    actions.ask(await nodes.snapshot(), input, { ...agent, id: crypto.randomUUID() }),
  );
  const attempts: NodeCommit[] = [
    { ...asked, changes: asked.changes.slice(0, -1) },
    {
      ...asked,
      changes: asked.changes.map((change, index) =>
        index === 0
          ? { ...change, data: { kind: 'question', text: 'Substituted wording.' } }
          : change,
      ),
    },
    {
      ...asked,
      changes: [...asked.changes, create('another-question', { kind: 'question', text: 'When?' })],
    },
    {
      ...asked,
      changes: [
        ...asked.changes,
        create('injected-child', { kind: 'content', text: 'Extra.' }, asked.changes[0].node),
      ],
    },
    {
      ...asked,
      changes: [create('foreign-only', { kind: 'content', text: 'Dropped all owner work.' })],
    },
    { ...asked, expectedReads: { source: 'setup' } },
    { ...asked, recordedBy: 'user' },
    { ...asked, origin: null },
  ];
  await Promise.all(
    attempts.map((attempt) =>
      expect(nodes.commit(structuredClone(attempt))).rejects.toBeInstanceOf(
        NodePublicationRejected,
      ),
    ),
  );
  expect((await nodes.snapshot()).get(asked.changes[0].node)).toBeUndefined();
  await nodes.commit(asked);
  expect(await readQuestions(nodes)).toHaveLength(1);
  raw.close();
});

test('an Answer action cannot lose or retarget its evidence Relationship', async () => {
  const { raw, nodes, actions } = await fixture();
  await nodes.commit(
    attributed(actions.ask(await nodes.snapshot(), input, { ...agent, id: crypto.randomUUID() })),
  );
  const [question] = await readQuestions(nodes);
  const answered = attributed(
    await actions.answer(
      await nodes.snapshot(),
      { question: question.key, text: 'Garden.' },
      { ...person, id: crypto.randomUUID() },
    ),
    person,
  );
  await expect(
    nodes.commit({ ...answered, changes: answered.changes.slice(0, -1) }),
  ).rejects.toBeInstanceOf(NodePublicationRejected);
  await expect(
    nodes.commit({
      ...answered,
      changes: answered.changes.map((change, index) =>
        index === 2
          ? { ...change, connection: { source: question.key, target: { node: 'foreign' } } }
          : change,
      ),
    }),
  ).rejects.toBeInstanceOf(NodePublicationRejected);
  expect((await readQuestions(nodes))[0].status).toBe('open');
  await nodes.commit(answered);
  raw.close();
});

test('other owners may add their changes and reads before admission, and exact accepted retries remain valid', async () => {
  const { raw, nodes, actions } = await fixture();
  const asked = attributed(
    actions.ask(await nodes.snapshot(), input, { ...agent, id: crypto.randomUUID() }),
  );
  const combined = {
    ...asked,
    kind: request('other-owner-operation', []).kind,
    message: 'Combined owner work',
    metadata: { combined: true },
    expectedReads: { ...asked.expectedReads, foreign: 'setup' },
    changes: [
      ...asked.changes,
      create('foreign-added', { kind: 'content', text: 'Other owner work.' }),
    ],
  };
  const accepted = await nodes.commit(structuredClone(combined));
  expect(await nodes.commit(structuredClone(combined))).toEqual(accepted);
  // Accepted retry identity remains authoritative when the application owner is reassembled.
  const replacement = createQuestionOwnership({ nodes: raw, reading });
  expect(await raw.commit(structuredClone(combined), replacement.publication)).toEqual(accepted);
  expect(await readQuestions(nodes)).toHaveLength(1);
  raw.close();
});

describe('Questions action publication through GitHub', () => {
  const stores: NodeBackend[] = [];
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      onLine: true,
      locks: { request: (_name: string, work: () => Promise<unknown>) => work() },
    });
    vi.stubGlobal('BroadcastChannel', undefined);
  });
  afterEach(async () => {
    for (const store of stores.splice(0)) store.close();
    await Promise.all(
      (await Dexie.getDatabaseNames())
        .filter((name) => name.startsWith('vaulter-nodes-'))
        .map((name) => Dexie.delete(name)),
    );
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  async function remoteFixture() {
    const fake = await fakeGitHub({});
    const open = (fetchFn = fake.fetchFn) => {
      const raw = githubNodeBackend({
        token: 'test',
        repo: { owner: 'fictional', name: 'vault', branch: 'main' },
        api: 'https://gh.test',
        fetch: fetchFn,
      });
      stores.push(raw);
      return raw;
    };
    const raw = open();
    await raw.commit(initialRecords());
    const actions = createQuestionOwnership({ nodes: raw, reading });
    const nodes: NodeStore = {
      ...raw,
      commit: (value) => raw.commit(value, actions.publication),
    };
    return { ...fake, open, raw, nodes, actions };
  }

  test('authoritative refresh rejects a stale creation action before writing, then accepts fresh owner actions', async () => {
    const { open, raw, nodes, actions, state } = await remoteFixture();
    const stale = attributed(
      actions.ask(await nodes.snapshot(), input, { ...agent, id: crypto.randomUUID() }),
    );
    const remote = open();
    await remote.refresh();
    await remote.commit(
      request('changed-source', [
        await revise(remote, 'source', { kind: 'content', text: 'Morning light has moved.' }),
      ]),
    );
    const head = state.main;
    state.calls.length = 0;
    await expect(nodes.commit(stale)).rejects.toThrow('Conflict');
    expect(state.main).toBe(head);
    expect(state.calls.filter((call) => /^(POST|PATCH) /.test(call))).toEqual([]);
    expect((await nodes.snapshot()).get(stale.changes[0].node)).toBeUndefined();
    const fresh = actions.ask(
      await nodes.snapshot(),
      { ...input, source: { node: 'source', transaction: 'changed-source' } },
      { ...agent, id: crypto.randomUUID() },
    );
    await nodes.commit(attributed(fresh));
    const [question] = await readQuestions(nodes);
    const answered = await actions.answer(
      await nodes.snapshot(),
      { question: question.key, text: 'The garden wall.' },
      { ...person, id: crypto.randomUUID() },
    );
    await nodes.commit(attributed(answered, person));
    expect((await readQuestions(raw))[0]).toMatchObject({
      status: 'answered',
      answers: [{ version: { data: { kind: 'answer', text: 'The garden wall.' } } }],
    });
  });

  test('authoritative history retains Questions ownership after a remote historical retag', async () => {
    const { open, nodes, state } = await remoteFixture();
    const remote = open();
    await remote.refresh();
    await remote.commit(
      request('historical-question', [
        create('historical-question', { kind: 'question', text: 'Old request.' }),
      ]),
    );
    await remote.commit(
      request('historical-retag', [
        await revise(remote, 'historical-question', { kind: 'content', text: 'Retagged history.' }),
      ]),
    );
    const head = state.main;
    state.calls.length = 0;
    await expect(
      nodes.commit(
        request('unauthorized-current-write', [
          {
            ...create('historical-question', { kind: 'content', text: 'Ordinary-looking edit.' }),
            expected: 'historical-retag',
          },
          create('must-not-publish', { kind: 'content', text: 'Atomic unrelated work.' }),
        ]),
      ),
    ).rejects.toBeInstanceOf(NodePublicationRejected);
    expect(state.main).toBe(head);
    expect(state.calls.filter((call) => /^(POST|PATCH) /.test(call))).toEqual([]);
    expect((await nodes.snapshot()).get('must-not-publish')).toBeUndefined();
  });

  test('an uncertain remote acceptance retries the retained action request without replay', async () => {
    const { open, raw, fetchFn, state, filesAt } = await remoteFixture();
    let lost = false;
    let disconnected = false;
    const flaky = (async (url, init) => {
      if (disconnected && String(url).endsWith('/git/ref/heads/main'))
        throw new TypeError('Remote confirmation is unavailable.');
      const response = await fetchFn(url, init);
      if (init?.method === 'PATCH' && response.ok && !lost) {
        lost = true;
        disconnected = true;
        throw new TypeError('Lost acceptance response.');
      }
      return response;
    }) as typeof fetch;
    const failing = open(flaky);
    await failing.refresh();
    const actions = createQuestionOwnership({ nodes: failing, reading });
    const asked = attributed(
      actions.ask(await failing.snapshot(), input, { ...agent, id: crypto.randomUUID() }),
    );
    await expect(failing.commit(asked, actions.publication)).rejects.toThrow('Lost acceptance');
    expect((await failing.snapshot()).get(asked.changes[0].node)).toBeUndefined();
    const acceptedHead = state.main;
    disconnected = false;
    // Session recovery may clone the entire request; it does not execute creation a second time.
    const accepted = await failing.commit(structuredClone(asked), actions.publication);
    expect(accepted.id).toBe(asked.id);
    expect(state.main).toBe(acceptedHead);
    expect(Object.keys(filesAt()).filter((path) => path.endsWith(`${asked.id}.json`))).toHaveLength(
      1,
    );
    await raw.refresh();
    expect(await readQuestions(raw)).toHaveLength(1);
    const replacement = createQuestionOwnership({ nodes: raw, reading });
    expect(await raw.commit(structuredClone(asked), replacement.publication)).toEqual(accepted);
    expect(state.main).toBe(acceptedHead);
  });
});

test('an entered publication retains its complete request across an uncertain save and retry', async () => {
  const { raw, actions } = await fixture();
  const asked = attributed(
    actions.ask(await raw.snapshot(), input, { ...agent, id: crypto.randomUUID() }),
  );
  let uncertain = true;
  const publication: NodePublicationRule = (context) => {
    actions.publication(context);
    if (uncertain) {
      uncertain = false;
      throw new Error('Connection lost before acceptance.');
    }
  };
  await expect(raw.commit(asked, publication)).rejects.toThrow('Connection lost');
  await expect(
    raw.commit(
      {
        ...asked,
        changes: [
          ...asked.changes,
          create('late-foreign', { kind: 'content', text: 'Changed retry.' }),
        ],
      },
      publication,
    ),
  ).rejects.toBeInstanceOf(NodePublicationRejected);
  await raw.commit(structuredClone(asked), publication);
  expect(await readQuestions(raw)).toHaveLength(1);
  raw.close();
});

test('ownership survives historical Question and Answer deletion, payload retagging and moved descendants', async () => {
  const { raw, nodes } = await fixture();
  await raw.commit(
    request('old-records', [
      create('old-question', { kind: 'question', text: 'Historical wording.' }),
      create('old-answer', { kind: 'answer', text: 'Historical Answer.' }),
      create('old-child', { kind: 'content', text: 'Owned nested record.' }, 'old-question'),
      {
        ...create('old-link', { kind: 'relationship', predicate: 'about' }),
        connection: { source: { node: 'old-question' }, target: { node: 'page' } },
      },
    ]),
  );
  await raw.commit(
    request('historical-translation', [
      await revise(raw, 'old-question', { kind: 'content', text: 'Retagged Question.' }),
      await revise(raw, 'old-answer', null),
      {
        ...(await revise(raw, 'old-child', { kind: 'content', text: 'Moved child.' })),
        placement: null,
      },
      {
        ...(await revise(raw, 'old-link', { kind: 'content', text: 'Retagged Relationship.' })),
        connection: null,
      },
    ]),
  );
  await Promise.all(
    ['old-question', 'old-answer', 'old-child', 'old-link'].map(async (node) =>
      expect(
        nodes.commit(
          request(`attempt-${node}`, [
            await revise(nodes, node, { kind: 'content', text: 'Bypass.' }),
          ]),
        ),
      ).rejects.toBeInstanceOf(NodePublicationRejected),
    ),
  );
  raw.close();
});

test('Questions rejects foreign task Relationships and new containment while allowing incoming references', async () => {
  const { raw, nodes, actions } = await fixture();
  const asked = actions.ask(await nodes.snapshot(), input, { ...agent, id: crypto.randomUUID() });
  await nodes.commit(attributed(asked));
  const question = asked.changes[0].node;
  const owned = [
    {
      ...create('outgoing', { kind: 'relationship', predicate: 'about' }),
      connection: { source: { node: question }, target: { node: 'foreign' } },
    },
    create(
      'unresolved',
      { kind: 'relationship', predicate: 'answered-by', label: 'Unknown' },
      question,
    ),
    create('ordinary-child', { kind: 'content', text: 'Unexpected nested content.' }, question),
  ];
  await Promise.all(
    owned.map((change) =>
      expect(nodes.commit(request(`attempt-${change.node}`, [change]))).rejects.toBeInstanceOf(
        NodePublicationRejected,
      ),
    ),
  );
  await nodes.commit(
    request('incoming-reference', [
      {
        ...create('incoming', { kind: 'relationship', predicate: 'references' }, 'foreign'),
        connection: { source: { node: 'foreign' }, target: { node: question } },
      },
      await revise(nodes, 'source', { kind: 'content', text: 'A later source revision.' }),
    ]),
  );
  expect((await readQuestions(nodes))[0].sources?.[0].state).toBe('newer');
  raw.close();
});

test('historical text-only Questions remain answerable and concurrent direct Answers conflict atomically', async () => {
  const { raw, nodes, actions } = await fixture();
  await raw.commit(
    request('historical-question', [create('question', { kind: 'question', text: 'Which wall?' })]),
  );
  const view = await nodes.snapshot();
  const question = { node: 'question', transaction: 'historical-question' };
  const first = attributed(
    await actions.answer(
      view,
      { question, text: 'Garden.' },
      { ...person, id: crypto.randomUUID() },
    ),
    person,
  );
  const second = attributed(
    await actions.answer(
      view,
      { question, text: 'Street.' },
      { ...person, id: crypto.randomUUID() },
    ),
    person,
  );
  await nodes.commit(first);
  await expect(nodes.commit(second)).rejects.toThrow('Conflict');
  expect((await readQuestions(nodes))[0]).toMatchObject({
    status: 'answered',
    answers: [{ version: { data: { text: 'Garden.' } } }],
  });
  expect((await nodes.snapshot()).get(second.changes[1].node)).toBeUndefined();
  raw.close();
});

test('answer admission retains historical outgoing evidence outside reachable containment', async () => {
  const { raw, nodes, actions } = await fixture();
  await raw.commit(
    request('historical-question', [
      create('question', { kind: 'question', text: 'Which wall?' }),
      create('hidden-container', { kind: 'content', text: 'Old record group.' }),
      {
        ...create(
          'external-evidence',
          { kind: 'relationship', predicate: 'answered-by' },
          'hidden-container',
        ),
        connection: {
          source: { node: 'question' },
          target: { node: 'foreign', transaction: 'setup' },
        },
      },
    ]),
  );
  await raw.commit(request('removed-container', [await revise(raw, 'hidden-container', null)]));
  await expect(
    actions.answer(
      await nodes.snapshot(),
      { question: { node: 'question', transaction: 'historical-question' }, text: 'Garden.' },
      { ...person, id: crypto.randomUUID() },
    ),
  ).rejects.toThrow('no longer open');
  await expect(
    nodes.commit(
      request('retarget-external', [
        { ...(await revise(nodes, 'external-evidence', null)), placement: null, connection: null },
      ]),
    ),
  ).rejects.toBeInstanceOf(NodePublicationRejected);
  raw.close();
});

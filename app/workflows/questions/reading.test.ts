import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { createQuestionsReading, readQuestion, readQuestions } from './reading.ts';

test('one retained question shares its subjects and explicit answer independently of placement', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor', name: 'Owner' }),
      create('studio', { kind: 'page', title: 'Studio' }),
      create('garden', { kind: 'page', title: 'Garden' }),
      create('chat', { kind: 'conversation', title: 'Planning' }),
      create('exchange', { kind: 'exchange' }, 'chat'),
      create('question', { kind: 'question', text: 'Where should the workbench go?' }, 'studio'),
      create('answer', { kind: 'message', text: 'Keep it by the garden door.' }, 'exchange'),
      {
        ...create('about', { kind: 'relationship', predicate: 'about' }, 'garden'),
        connection: { source: { node: 'question' }, target: { node: 'garden' } },
      },
      {
        ...create('answered', { kind: 'relationship', predicate: 'answered-by' }, 'exchange'),
        connection: {
          source: { node: 'question' },
          target: { node: 'answer', transaction: 'original' },
        },
      },
    ]),
  );
  const [question] = await readQuestions(nodes);
  expect(question).toMatchObject({
    id: 'question',
    status: 'answered',
    subject: { address: { node: 'studio' }, state: 'available' },
    subjects: [{ address: { node: 'studio' } }, { address: { node: 'garden' } }],
    answers: [
      {
        relationship: 'answered',
        address: { node: 'answer', transaction: 'original' },
        version: { data: { text: 'Keep it by the garden door.' } },
        state: 'available',
      },
    ],
    created: { transaction: 'original', author: { node: 'user' }, origin: null },
  });
  nodes.close();
});

test('editing or removing answer content preserves the recorded answer and exact version', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('question', { kind: 'question', text: 'Where?' }, 'page'),
      create('answer', { kind: 'message', text: 'Garden.' }),
      {
        ...create('answered', { kind: 'relationship', predicate: 'answered-by' }, 'question'),
        connection: {
          source: { node: 'question' },
          target: { node: 'answer', transaction: 'original' },
        },
      },
    ]),
  );
  await nodes.commit(
    request('edited', [await revise(nodes, 'answer', { kind: 'message', text: 'Studio.' })]),
  );
  expect((await readQuestions(nodes))[0]).toMatchObject({
    status: 'answered',
    answers: [{ state: 'newer', version: { data: { text: 'Garden.' } } }],
  });
  await nodes.commit(request('removed', [await revise(nodes, 'answer', null)]));
  expect((await readQuestions(nodes))[0]).toMatchObject({
    status: 'answered',
    answers: [{ state: 'deleted', version: { data: { text: 'Garden.' } } }],
  });
  nodes.close();
});

test('unanswered and unresolved questions remain open after the subject is removed', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('question', { kind: 'question', text: 'Where?' }, 'page'),
      create(
        'unresolved',
        { kind: 'relationship', predicate: 'answered-by', label: 'A missing response' },
        'question',
      ),
    ]),
  );
  const view = await nodes.snapshot();
  expect(readQuestion(view.get('question')!, view)).toMatchObject({
    status: 'open',
    answers: [{ state: 'unresolved', label: 'A missing response' }],
  });
  await nodes.commit(request('removed', [await revise(nodes, 'page', null)]));
  expect((await readQuestions(nodes))[0]).toMatchObject({
    id: 'question',
    status: 'open',
    subject: { address: { node: 'page' }, state: 'deleted' },
  });
  nodes.close();
});

test('abandonment and answered-by changes are read from their recorded state', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('question', { kind: 'question', text: 'Where?', abandoned: true }),
      create('answer', { kind: 'decision', what: 'Garden.' }),
    ]),
  );
  expect((await readQuestions(nodes))[0].status).toBe('abandoned');
  await nodes.commit(
    request('answered', [
      {
        ...create('answered-by', { kind: 'relationship', predicate: 'answered-by' }, 'question'),
        connection: { source: { node: 'question' }, target: { node: 'answer' } },
      },
    ]),
  );
  expect((await readQuestions(nodes))[0].status).toBe('answered');
  await nodes.commit(request('retracted', [await revise(nodes, 'answered-by', null)]));
  expect((await readQuestions(nodes))[0].status).toBe('abandoned');
  nodes.close();
});

test('question creation origin remains distinct from its subject and latest editor', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('agent', { kind: 'agent' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('exchange', { kind: 'exchange' }),
    ]),
  );
  await nodes.commit({
    ...request('raised', [create('question', { kind: 'question', text: 'Where?' }, 'page')]),
    recordedBy: 'agent',
    origin: 'exchange',
  });
  await nodes.commit(
    request('edited', [await revise(nodes, 'question', { kind: 'question', text: 'Which wall?' })]),
  );
  const [question] = await readQuestions(nodes);
  expect(question).toMatchObject({
    subject: { address: { node: 'page' } },
    created: {
      transaction: 'raised',
      author: { node: 'agent' },
      origin: { node: 'exchange' },
    },
    updated: { transaction: 'edited', author: { node: 'user' }, origin: null },
  });
  nodes.close();
});

test('the collection includes questions older than a full transaction page', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('question', { kind: 'question', text: 'Original question?' }),
      create('other', { kind: 'content', text: 'Original.' }),
    ]),
  );
  for (let index = 0; index < 205; index++) {
    // biome-ignore lint/performance/noAwaitInLoops: each revision depends on the preceding version.
    await nodes.commit(
      request(`edit-${index}`, [
        await revise(nodes, 'other', { kind: 'content', text: `${index}` }),
      ]),
    );
  }
  expect((await readQuestions(nodes)).map((question) => question.id)).toEqual(['question']);
  nodes.close();
});

test('Questions reading owns subscriptions and stops publishing after disposal', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('question', { kind: 'question', text: 'Where?' }),
    ]),
  );
  const reading = createQuestionsReading(nodes);
  await reading.reload();
  expect(reading.snapshot().questions?.[0].status).toBe('open');
  let publications = 0;
  reading.subscribe(() => publications++);
  reading.start();
  await reading.reload();
  reading.dispose();
  const before = publications;
  await nodes.commit(
    request('abandoned', [
      await revise(nodes, 'question', { kind: 'question', text: 'Where?', abandoned: true }),
    ]),
  );
  await reading.reload();
  expect(reading.closed()).toBe(true);
  expect(publications).toBe(before);
  expect(reading.snapshot().questions?.[0].status).toBe('open');
  nodes.close();
});

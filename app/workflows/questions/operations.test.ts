import { expect, test } from 'vitest';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import type { QuestionCommit } from './operations.ts';
import { prepareAnswerQuestion, prepareAskQuestion } from './operations.ts';
import { readQuestions } from './reading.ts';
import { parseAnswer } from './records.ts';

const attributed = (prepared: QuestionCommit) => ({
  ...prepared,
  recordedBy: 'user',
  origin: null,
  undoOf: null,
});

async function fixture() {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('section', { kind: 'section' }, 'page'),
      create('heading', { kind: 'heading' }, 'section'),
      create('detached-section', { kind: 'section' }),
      create('foreign', { kind: 'content', text: 'Source record.' }),
    ]),
  );
  return nodes;
}

test('Questions prepares retained asks with optional Wiki placement and no ancestor changes', async () => {
  const nodes = await fixture();
  const view = await nodes.snapshot();
  const prepared = prepareAskQuestion(view, {
    id: 'asked',
    node: 'question',
    text: '  Which wall?  ',
    subject: 'section',
  });
  expect(prepared.expectedReads).toEqual({ section: 'setup', page: 'setup', heading: 'setup' });
  expect(prepared.changes).toEqual([
    {
      node: 'question',
      expected: null,
      data: { kind: 'question', text: 'Which wall?' },
      placement: { parent: 'section', order: 'az' },
      connection: null,
    },
  ]);
  expect(view.get('question')).toBeUndefined();
  await nodes.commit(attributed(prepared));
  expect((await readQuestions(nodes))[0]).toMatchObject({
    status: 'open',
    subject: { address: { node: 'section' } },
  });
  expect((await nodes.snapshot()).children('section').map((node) => node.key.node)).toEqual([
    'heading',
    'question',
  ]);
  const unplaced = prepareAskQuestion(await nodes.snapshot(), {
    id: 'unplaced',
    node: 'standalone',
    text: 'When?',
  });
  await nodes.commit(attributed(unplaced));
  expect((await readQuestions(nodes)).find((entry) => entry.id === 'standalone')).toMatchObject({
    status: 'open',
    subjects: [],
  });
  nodes.close();
});

test('Questions rejects empty requests and unavailable or unsupported Wiki subjects', async () => {
  const nodes = await fixture();
  const options = { id: 'asked', node: 'question', text: 'Where?' };
  const view = await nodes.snapshot();
  expect(() => prepareAskQuestion(view, { ...options, text: ' \n ' })).toThrow();
  for (const subject of ['missing', 'foreign', 'detached-section'])
    expect(() => prepareAskQuestion(view, { ...options, subject })).toThrow();
  await nodes.commit(request('removed-page', [await revise(nodes, 'page', null)]));
  const removed = await nodes.snapshot();
  expect(() => prepareAskQuestion(removed, { ...options, subject: 'section' })).toThrow();
  nodes.close();
});

test('a subject change rejects the complete prepared ask without publishing a question', async () => {
  const nodes = await fixture();
  const prepared = prepareAskQuestion(await nodes.snapshot(), {
    id: 'asked',
    node: 'question',
    text: 'Which wall?',
    subject: 'section',
  });
  await nodes.commit(request('removed-page', [await revise(nodes, 'page', null)]));
  await expect(nodes.commit(attributed(prepared))).rejects.toThrow('Conflict');
  expect((await nodes.snapshot()).get('question')).toBeUndefined();
  nodes.close();
});

test('a direct Answer and its exact relationship publish atomically while retaining the asked wording', async () => {
  const nodes = await fixture();
  await nodes.commit(
    attributed(
      prepareAskQuestion(await nodes.snapshot(), {
        id: 'asked',
        node: 'question',
        text: 'Which wall?',
        subject: 'page',
      }),
    ),
  );
  const prepared = prepareAnswerQuestion(await nodes.snapshot(), {
    id: 'answered',
    node: 'answer',
    relationship: 'answered-by',
    question: { node: 'question', transaction: 'asked' },
    text: '  The garden wall.  ',
  });
  await nodes.commit(attributed(prepared));
  expect((await nodes.changes('answered')).map((change) => change.node)).toEqual([
    'question',
    'answer',
    'answered-by',
  ]);
  const view = await nodes.snapshot();
  expect(view.get('question')?.key.transaction).toBe('answered');
  expect(view.get('answered-by')?.connection).toEqual({
    source: { node: 'question', transaction: 'asked' },
    target: { node: 'answer', transaction: 'answered' },
  });
  expect((await readQuestions(nodes))[0]).toMatchObject({
    status: 'answered',
    answers: [{ version: { data: { kind: 'answer', text: 'The garden wall.' } } }],
  });
  await nodes.commit(
    request('edited-answer', [
      await revise(nodes, 'answer', { kind: 'answer', text: 'The other wall.' }),
    ]),
  );
  await nodes.commit(request('removed-answer', [await revise(nodes, 'answer', null)]));
  const [question] = await readQuestions(nodes);
  expect(question).toMatchObject({
    status: 'answered',
    answers: [{ state: 'deleted', version: { data: { text: 'The garden wall.' } } }],
  });
  expect(view.resolve({ node: 'question', transaction: 'asked' })?.data?.text).toBe('Which wall?');
  nodes.close();
});

test('Questions rejects stale wording, closed questions and empty direct answers', async () => {
  const nodes = await fixture();
  await nodes.commit(
    request('asked', [create('question', { kind: 'question', text: 'Which wall?' })]),
  );
  const options = {
    id: 'answered',
    node: 'answer',
    relationship: 'answered-by',
    question: { node: 'question', transaction: 'asked' },
    text: 'Garden.',
  };
  const view = await nodes.snapshot();
  expect(() => prepareAnswerQuestion(view, { ...options, text: ' \n ' })).toThrow();
  expect(() =>
    prepareAnswerQuestion(view, {
      ...options,
      question: { node: 'question', transaction: 'setup' },
    }),
  ).toThrow('changed');
  await nodes.commit(
    request('abandoned', [
      await revise(nodes, 'question', { kind: 'question', text: 'Which wall?', abandoned: true }),
    ]),
  );
  const closed = await nodes.snapshot();
  expect(() =>
    prepareAnswerQuestion(closed, {
      ...options,
      question: { node: 'question', transaction: 'abandoned' },
    }),
  ).toThrow('open Question');
  nodes.close();
});

test('a recorded external Answer relationship closes the question independently of its placement', async () => {
  const nodes = await fixture();
  await nodes.commit(
    request('asked', [
      create('question', { kind: 'question', text: 'Which wall?' }),
      create('evidence', { kind: 'content', text: 'Garden.' }),
      {
        ...create('external', { kind: 'relationship', predicate: 'answered-by' }, 'foreign'),
        connection: { source: { node: 'question' }, target: { node: 'evidence' } },
      },
    ]),
  );
  const view = await nodes.snapshot();
  expect(() =>
    prepareAnswerQuestion(view, {
      id: 'answered',
      node: 'answer',
      relationship: 'answered-by',
      question: { node: 'question', transaction: 'asked' },
      text: 'Garden.',
    }),
  ).toThrow('open Question');
  nodes.close();
});

test('retained incoming Answer relationships close questions after their placement parent is removed', async () => {
  const nodes = await fixture();
  await nodes.commit(
    request('asked', [
      create('question', { kind: 'question', text: 'Which wall?' }),
      create('evidence', { kind: 'content', text: 'Garden.' }),
      {
        ...create('external', { kind: 'relationship', predicate: 'answered-by' }, 'foreign'),
        connection: { source: { node: 'question' }, target: { node: 'evidence' } },
      },
    ]),
  );
  await nodes.commit(request('removed-source', [await revise(nodes, 'foreign', null)]));
  const view = await nodes.snapshot();
  expect(() =>
    prepareAnswerQuestion(view, {
      id: 'answered',
      node: 'answer',
      relationship: 'answered-by',
      question: { node: 'question', transaction: 'asked' },
      text: 'Garden.',
      relationships: [view.get('external')!],
    }),
  ).toThrow('open Question');
  nodes.close();
});

test('concurrent direct answer saves accept one complete answer and reject the stale duplicate', async () => {
  const nodes = await fixture();
  await nodes.commit(
    request('asked', [create('question', { kind: 'question', text: 'Which wall?' })]),
  );
  const view = await nodes.snapshot();
  const options = { question: { node: 'question', transaction: 'asked' }, text: 'Garden.' };
  const first = prepareAnswerQuestion(view, {
    ...options,
    id: 'first',
    node: 'first-answer',
    relationship: 'first-link',
  });
  const second = prepareAnswerQuestion(view, {
    ...options,
    id: 'second',
    node: 'second-answer',
    relationship: 'second-link',
  });
  await nodes.commit(attributed(first));
  await expect(nodes.commit(attributed(second))).rejects.toThrow('Conflict');
  expect((await nodes.snapshot()).get('second-answer')).toBeUndefined();
  expect((await nodes.snapshot()).get('second-link')).toBeUndefined();
  expect((await readQuestions(nodes))[0].answers).toHaveLength(1);
  nodes.close();
});

test('Questions owns direct Answer grammar while retaining accepted text exactly', () => {
  expect(parseAnswer({ kind: 'answer', text: '  Garden.  ' })).toEqual({
    kind: 'answer',
    text: '  Garden.  ',
  });
  expect(() => parseAnswer({ kind: 'answer', text: '' })).toThrow();
  expect(() => parseAnswer({ kind: 'question', text: 'Where?' })).toThrow();
  expect(() => parseAnswer({ kind: 'answer', text: 'Garden.', status: 'answered' })).toThrow();
});

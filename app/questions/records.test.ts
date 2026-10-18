import { expect, test } from 'vitest';
import { createMemoryStorage, openDatabase, e } from '@/application/store/index.ts';
import { sourceEntities } from '@/sources/records.ts';
import { questionSchema } from './records.ts';
import { questionActions } from './operations.ts';
import { readEavQuestions } from './projection.ts';

async function fixture() {
  const storage = createMemoryStorage();
  const schema = e.registry({ ...questionSchema, ...sourceEntities });
  const db = await openDatabase({ schema, storage });
  const { user, agent, source } = await db.transaction(async (tx) => ({
    user: await tx.entities.actors.insert({ name: 'Owner', kind: 'user' }),
    agent: await tx.entities.actors.insert({ name: 'Assistant', kind: 'agent' }),
    source: await tx.entities.sourceDocuments.insert({
      key: 'source',
      title: 'Tools',
      text: 'I use the plane daily.',
      origin: '',
      attribution: 'Owner',
      capturedAt: new Date(),
      available: true,
    }),
  }));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const address = await db.history.reference(snapshot, source);
  const input = {
    key: 'question',
    text: 'Which tools?',
    suggestions: [
      { title: 'Keep the plane', text: 'Keep the plane close.', reason: 'Used daily.' },
    ],
    source: address,
    knowledge: [],
  };
  await questionActions(db, { author: agent }).ask(input);
  return { db, storage, schema, user, agent, source, input };
}

test('answers retain exact wording and attribution across reopen and removed evidence', async () => {
  const { db, storage, schema, user, source } = await fixture();
  const original = (await readEavQuestions(db))[0]!;
  await questionActions(db, { author: user }).answer(original.evidence, 'Keep the plane.');
  await db.transaction(async (tx) => {
    const answer = (await tx.entities.questionAnswers.query({ select: {} }))[0]!;
    await tx.entities.questionAnswers.update({ ...answer, text: 'New answer', available: false });
    await tx.entities.sourceDocuments.update({
      ...source,
      text: 'Changed source',
      available: false,
    });
  });
  await db[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema, storage });
  const question = (await readEavQuestions(reopened))[0]!;
  expect(question.status).toBe('answered');
  expect(question.answers[0]).toMatchObject({ text: 'Keep the plane.', state: 'deleted' });
  expect(question.sources?.[0]).toMatchObject({ text: 'I use the plane daily.', state: 'deleted' });
  const changes = await reopened.history.entities.questionAnswers.first({
    select: { after: { questionVersion: true }, transaction: { author: true } },
    orderBy: [{ sequence: 'asc' }],
  });
  expect(changes?.after?.questionVersion).toEqual(original.evidence);
  expect(changes?.transaction.author).toBeDefined();
});

test('stale drafts, duplicate answers and untrusted producers cannot publish', async () => {
  const { db, user, agent, input } = await fixture();
  await using owned = db;
  await expect(
    questionActions(owned, { author: user }).ask({ ...input, key: 'other' }),
  ).rejects.toThrow('Agent');
  const original = (await readEavQuestions(owned))[0]!;
  await expect(
    questionActions(owned, { author: agent }).answer(original.evidence, 'Answer'),
  ).rejects.toThrow('person');
  await owned.transaction(async (tx) => {
    const question = (await tx.entities.questions.query({ select: {} }))[0]!;
    await tx.entities.questions.update({ ...question, text: 'Changed wording?' });
  });
  await expect(
    questionActions(owned, { author: user }).answer(original.evidence, 'Old draft'),
  ).rejects.toThrow('changed');
  const current = (await readEavQuestions(owned))[0]!;
  const results = await Promise.allSettled([
    questionActions(owned, { author: user }).answer(current.evidence, 'First'),
    questionActions(owned, { author: user }).answer(current.evidence, 'Second'),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(await owned.entities.questionAnswers.query({ select: {} })).toHaveLength(1);
});

test('explicit abandonment closes a question without inventing an answer', async () => {
  const { db, user } = await fixture();
  await using owned = db;
  const question = (await readEavQuestions(owned))[0]!;
  await questionActions(owned, { author: user }).abandon(question.evidence);
  expect((await readEavQuestions(owned))[0]).toMatchObject({ status: 'abandoned', answers: [] });
});

test('retained EAV save retry publishes one answer after an uncertain acknowledgement', async () => {
  const { db, user } = await fixture();
  await using owned = db;
  const question = (await readEavQuestions(owned))[0]!;
  const { createQuestionAnswers } = await import('@/questions/answers.ts');
  const { SaveError } = await import('@/application/store/index.ts');
  let attempts = 0;
  let retries = 0;
  const answers = createQuestionAnswers({
    session: {},
    actions: {
      answer: async (selected, text) => {
        attempts++;
        await questionActions(owned, { author: user }).answer(selected.evidence, text);
        throw new SaveError(new Error('Acknowledgement lost'), () => {
          retries++;
          return Promise.resolve();
        });
      },
    },
  });
  await expect(answers.answer(question, 'Keep the plane.')).rejects.toThrow();
  expect(answers.snapshot().attempts[0]).toMatchObject({
    phase: 'uncertain',
    text: 'Keep the plane.',
  });
  await expect(answers.answer(question, 'Changed draft')).rejects.toThrow('original answer');
  await Promise.all([answers.retry(question.id), answers.retry(question.id)]);
  expect({ attempts, retries }).toEqual({ attempts: 1, retries: 1 });
  expect(answers.snapshot().attempts).toEqual([]);
  expect(await owned.entities.questionAnswers.query({ select: {} })).toHaveLength(1);
  answers.dispose();
});

test('collection subscriptions refresh accepted changes and retain the last view on read failure', async () => {
  const { db, user } = await fixture();
  await using owned = db;
  const { createQuestionsReading } = await import('@/questions/reading.ts');
  let unavailable = false;
  const reading = createQuestionsReading({
    collection: () =>
      unavailable ? Promise.reject(new Error('Offline read')) : readEavQuestions(owned),
    subscribe: owned.subscribe,
  });
  reading.start();
  await reading.reload();
  const original = reading.snapshot().questions![0]!;
  await questionActions(owned, { author: user }).answer(original.evidence, 'Keep it.');
  await reading.reload();
  expect(reading.snapshot().questions![0]!.status).toBe('answered');
  unavailable = true;
  await reading.reload();
  expect(reading.snapshot()).toMatchObject({
    loading: false,
    error: 'Offline read',
    questions: [{ status: 'answered' }],
  });
  reading.dispose();
  expect(reading.closed()).toBe(true);
});

test('session closure prevents later answers and retries', async () => {
  const { db } = await fixture();
  await using owned = db;
  const question = (await readEavQuestions(owned))[0]!;
  const { createQuestionAnswers } = await import('@/questions/answers.ts');
  let writes = 0;
  const answers = createQuestionAnswers({
    session: {},
    actions: {
      answer: () => {
        writes++;
        return Promise.resolve();
      },
    },
  });
  answers.dispose();
  await expect(answers.answer(question, 'Keep it.')).rejects.toThrow('closed');
  expect(writes).toBe(0);
});

test('complete Question assembly and trusted author lookup work beyond the default query page', async () => {
  const { db, input } = await fixture();
  await using owned = db;
  await owned.transaction(async (tx) => {
    for (let index = 0; index < 105; index++) {
      await tx.entities.actors.insert({ name: `Person ${index}`, kind: 'user' });
      const question = await tx.entities.questions.insert({
        key: `bulk-${index}`,
        text: `Question ${index}?`,
        status: 'open',
        createdAt: new Date(),
        available: true,
      });
      await tx.entities.questionContexts.insert({
        question,
        role: 'source',
        target: input.source,
        order: 0,
      });
    }
  });
  const { sameEntity } = await import('@/application/store/index.ts');
  const actorPage = await owned.entities.actors.query({ select: {} });
  const user = (await owned.entities.actors.query({ select: { kind: true }, limit: null })).find(
    (actor) => actor.kind === 'user' && !actorPage.some((row) => sameEntity(row, actor)),
  )!;
  const questionPage = await owned.entities.questions.query({ select: {} });
  const target = (await owned.entities.questions.query({ select: {}, limit: null })).find(
    (question) => !questionPage.some((row) => sameEntity(row, question)),
  )!;
  const latest = (await owned.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await questionActions(owned, { author: user }).answer(
    await owned.history.reference(latest, target),
    'Retained answer',
  );
  const questions = await readEavQuestions(owned);
  expect(questions).toHaveLength(106);
  expect(
    questions.every((question) => question.sources?.[0]?.text === 'I use the plane daily.'),
  ).toBe(true);
  expect(questions.find((question) => question.answers.length)?.answers[0]?.text).toBe(
    'Retained answer',
  );
});

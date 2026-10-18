import { expect, test } from 'vitest';
import { previewModel } from '@/preview/model.ts';
import { createMemoryStorage } from '@/core/store/index.ts';
import { applicationWiki, createApplicationConversation } from './composition/composition.ts';
import { seedEavWiki } from '@/preview/wiki-records.ts';
import { readEavQuestions } from '@/modules/questions/projection.ts';
import { createApplicationIdentities } from './composition/identities.ts';

test('Application agent asks an EAV Question and reopens its accepted receipt without execution', async () => {
  const storage = createMemoryStorage();
  const db = await applicationWiki(storage).database();
  await seedEavWiki(db);
  const setup = createApplicationIdentities(() => applicationWiki(storage).database());
  await setup.ensure();
  const options = {
    session: {},
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
    await reopened.reload();
    expect(reopened.snapshot().turns.flatMap(({ parts }) => parts)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'tool', name: 'askQuestion', output: receipt }),
      ]),
    );
    expect(await readEavQuestions(db)).toHaveLength(1);
  } finally {
    chat.dispose();
    reopened.dispose();
  }
});

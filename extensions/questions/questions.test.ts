import { expect, it } from 'vitest';
import { startApp } from '../../src/kernel/testing.ts';

const APP = ['store-local', 'questions'];
const ask = { topic: 'merge', title: 'Same Ada?', choices: [{ id: 'yes', label: 'Yes' }] };

it("hands the person's answer to the asker's handler for its topic", async () => {
  await startApp(APP);
  const { questionsFor } = await import('#questions');
  const asker = questionsFor('asker');
  const got: (string | undefined)[] = [];
  await asker.handle('merge', (a) => {
    got.push(a.choice);
  });
  const id = await asker.ask(ask);
  // The screen answers, as the person.
  await questionsFor('screen').answer(id, { choice: 'yes' });
  expect(got).toEqual(['yes']);
});

it("keeps a person's answer when the asker's handler fails, and delivers it again later", async () => {
  await startApp(APP);
  const before = (await import('#questions')).questionsFor('asker');
  await before.handle('merge', () => {
    throw new Error('the asker broke');
  });
  const id = await before.ask(ask);
  await before.answer(id, { choice: 'yes' });
  expect((await before.get(id))?.status).toBe('answered');

  // The app starts again, and the asker registers its handler again: it is handed the answer then.
  await startApp(APP);
  const after = (await import('#questions')).questionsFor('asker');
  const got: (string | undefined)[] = [];
  await after.handle('merge', (a) => {
    got.push(a.choice);
  });
  expect(got).toEqual(['yes']);
});

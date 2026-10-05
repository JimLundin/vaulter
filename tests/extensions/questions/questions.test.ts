import { expect, it } from 'vitest';
import { startApp } from '../../app.ts';

/** Time for listeners, which hear of a change after it is kept. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

const APP = ['storage', 'questions'];
const ask = {
  topic: 'merge',
  title: 'Same Ada?',
  choices: [{ id: 'yes', label: 'Yes' }],
};

it("hands the answer to the asker's handler for its topic", async () => {
  await startApp(APP);
  const { questionsFor } = await import('#extensions/questions');
  const asker = questionsFor('asker');
  const got: (string | undefined)[] = [];
  await asker.handle('merge', (first) => {
    got.push(first.choice);
  });
  const id = await asker.ask(ask);
  // The screen answers, as the person.
  await questionsFor('screen').answer(id, { choice: 'yes' });
  expect(got).toEqual(['yes']);
});

it('keeps an answer the handler failed on, for later', async () => {
  await startApp(APP);
  const before = (await import('#extensions/questions')).questionsFor('asker');
  await before.handle('merge', () => {
    throw new Error('the asker broke');
  });
  const id = await before.ask(ask);
  await before.answer(id, { choice: 'yes' });
  expect((await before.get(id))?.status).toBe('answered');

  // The app starts again, and the asker registers its handler again: it is
  // handed the answer then.
  await startApp(APP);
  const after = (await import('#extensions/questions')).questionsFor('asker');
  const got: (string | undefined)[] = [];
  await after.handle('merge', (first) => {
    got.push(first.choice);
  });
  expect(got).toEqual(['yes']);
});

/** Questions as a fresh asker has them. */
async function use() {
  await startApp(['questions']);
  return (await import('#extensions/questions')).questionsFor('test');
}

it('keeps an asked question open until it is answered', async () => {
  const asker = await use();
  const id = await asker.ask({
    topic: 'merge',
    title: 'Is Ada the same as Ada L.?',
    choices: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
  });
  const got = await asker.get(id);
  expect([got?.title, got?.status, got?.topic]).toEqual([
    'Is Ada the same as Ada L.?',
    'open',
    'merge',
  ]);
  expect(
    (await asker.open()).some((x) => x.id === id),
    'listed as open',
  ).toBeTruthy();
  await asker.answer(id, { choice: 'yes' });
  expect((await asker.get(id))?.status).toEqual('answered');
  expect(
    !(await asker.open()).some((x) => x.id === id),
    'no longer open',
  ).toBeTruthy();
});
it('asks once per key while the question is open', async () => {
  const asker = await use();
  const first = await asker.ask({
    topic: 'date',
    title: 'When was the trip?',
    key: 'trip-date',
  });
  const second = await asker.ask({
    topic: 'date',
    title: 'When was the trip?',
    key: 'trip-date',
  });
  expect(first).toEqual(second);
});
it('delivers an answer to a handler registered after it', async () => {
  const asker = await use();
  const id = await asker.ask({
    topic: 'later',
    title: 'Which café?',
    data: { note: 'n1' },
  });
  await asker.answer(id, { text: 'Café Lumière' });
  const got: unknown[] = [];
  await asker.handle('later', (first, question) => {
    got.push([first.text, question.data]);
  });
  await settle();
  expect(got).toEqual([['Café Lumière', { note: 'n1' }]]);
  // Delivered once, not again on the next registration.
  await asker.handle('later', () => {
    got.push('again');
  });
  await settle();
  expect(got.length).toEqual(1);
});
it('refuses an answer that is not one of the choices', async () => {
  const asker = await use();
  const id = await asker.ask({
    topic: 'pick',
    title: 'Pick one',
    choices: [{ id: 'a', label: 'A' }],
  });
  await expect(asker.answer(id, { choice: 'b' })).rejects.toThrow();
  await expect(asker.answer(id, { text: 'free text' })).rejects.toThrow();
});

import { expect, it } from 'vitest';
import { startApp } from '../../src/kernel/testing.ts';

/** Time for listeners, which hear of a change after it is kept. */
const settle = () => new Promise((ok) => setTimeout(ok, 20));

const APP = ['store-local', 'questions'];
const ask = { topic: 'merge', title: 'Same Ada?', choices: [{ id: 'yes', label: 'Yes' }] };

it("hands the person's answer to the asker's handler for its topic", async () => {
  await startApp(APP);
  const { questionsFor } = await import('./index.ts');
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
  const before = (await import('./index.ts')).questionsFor('asker');
  await before.handle('merge', () => {
    throw new Error('the asker broke');
  });
  const id = await before.ask(ask);
  await before.answer(id, { choice: 'yes' });
  expect((await before.get(id))?.status).toBe('answered');

  // The app starts again, and the asker registers its handler again: it is handed the answer then.
  await startApp(APP);
  const after = (await import('./index.ts')).questionsFor('asker');
  const got: (string | undefined)[] = [];
  await after.handle('merge', (a) => {
    got.push(a.choice);
  });
  expect(got).toEqual(['yes']);
});

/** Questions as a fresh asker has them. */
const use = async () => {
  await startApp(['questions']);
  return (await import('./index.ts')).questionsFor('test');
};

it('keeps an asked question open until it is answered', async () => {
  const q = await use();
  const id = await q.ask({
    topic: 'merge',
    title: 'Is Ada the same as Ada L.?',
    choices: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
  });
  const got = await q.get(id);
  expect([got?.title, got?.status, got?.topic]).toEqual([
    'Is Ada the same as Ada L.?',
    'open',
    'merge',
  ]);
  expect(
    (await q.open()).some((x) => x.id === id),
    'listed as open',
  ).toBeTruthy();
  await q.answer(id, { choice: 'yes' });
  expect((await q.get(id))?.status).toEqual('answered');
  expect(!(await q.open()).some((x) => x.id === id), 'no longer open').toBeTruthy();
});
it('asks once per key while the question is open', async () => {
  const q = await use();
  const a = await q.ask({ topic: 'date', title: 'When was the trip?', key: 'trip-date' });
  const b = await q.ask({ topic: 'date', title: 'When was the trip?', key: 'trip-date' });
  expect(a).toEqual(b);
});
it("delivers an answer to the asker's handler, also when it registers afterwards", async () => {
  const q = await use();
  const id = await q.ask({ topic: 'later', title: 'Which café?', data: { note: 'n1' } });
  await q.answer(id, { text: 'Café Lumière' });
  const got: unknown[] = [];
  await q.handle('later', (a, question) => {
    got.push([a.text, question.data]);
  });
  await settle();
  expect(got).toEqual([['Café Lumière', { note: 'n1' }]]);
  // Delivered once, not again on the next registration.
  await q.handle('later', () => {
    got.push('again');
  });
  await settle();
  expect(got.length).toEqual(1);
});
it('refuses an answer that is not one of the choices', async () => {
  const q = await use();
  const id = await q.ask({
    topic: 'pick',
    title: 'Pick one',
    choices: [{ id: 'a', label: 'A' }],
  });
  await expect(q.answer(id, { choice: 'b' })).rejects.toThrow();
  await expect(q.answer(id, { text: 'free text' })).rejects.toThrow();
});

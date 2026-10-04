// What every provider of questions@1 must do.
import { defineConformance } from '@vaulter/kernel';
import { questions } from './index.ts';

const wait = () => new Promise((ok) => setTimeout(ok, 20));

export default defineConformance(questions, [
  {
    name: 'keeps an asked question open until it is answered',
    async run(q, t) {
      const id = await q.ask({
        topic: 'merge',
        title: 'Is Ada the same as Ada L.?',
        choices: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
      });
      const got = await q.get(id);
      t.equal(
        [got?.title, got?.status, got?.topic],
        ['Is Ada the same as Ada L.?', 'open', 'merge'],
      );
      t.ok(
        (await q.open()).some((x) => x.id === id),
        'listed as open',
      );
      await q.answer(id, { choice: 'yes' });
      t.equal((await q.get(id))?.status, 'answered');
      t.ok(!(await q.open()).some((x) => x.id === id), 'no longer open');
    },
  },
  {
    name: 'asks once per key while the question is open',
    async run(q, t) {
      const a = await q.ask({ topic: 'date', title: 'When was the trip?', key: 'trip-date' });
      const b = await q.ask({ topic: 'date', title: 'When was the trip?', key: 'trip-date' });
      t.equal(a, b);
    },
  },
  {
    name: "delivers an answer to the asker's handler, also when it registers afterwards",
    async run(q, t) {
      const id = await q.ask({ topic: 'later', title: 'Which café?', data: { note: 'n1' } });
      await q.answer(id, { text: 'Café Lumière' });
      const got: unknown[] = [];
      await q.handle('later', (a, question) => {
        got.push([a.text, question.data]);
      });
      await wait();
      t.equal(got, [['Café Lumière', { note: 'n1' }]]);
      // Delivered once, not again on the next registration.
      await q.handle('later', () => {
        got.push('again');
      });
      await wait();
      t.equal(got.length, 1);
    },
  },
  {
    name: 'refuses an answer that is not one of the choices',
    async run(q, t) {
      const id = await q.ask({
        topic: 'pick',
        title: 'Pick one',
        choices: [{ id: 'a', label: 'A' }],
      });
      await t.rejects(q.answer(id, { choice: 'b' }));
      await t.rejects(q.answer(id, { text: 'free text' }));
    },
  },
  {
    name: 'lets the asker withdraw its question',
    async run(q, t) {
      const id = await q.ask({ topic: 'x', title: 'Never mind' });
      await q.withdraw(id);
      t.equal((await q.get(id))?.status, 'withdrawn');
    },
  },
]);

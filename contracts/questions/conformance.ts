// What every provider of questions@1 must do.
import { defineConformance } from '../conformance.ts';
import { questions } from './index.ts';

const wait = () => new Promise((ok) => setTimeout(ok, 20));

export default defineConformance(questions, [
  {
    name: 'keeps an asked question open until it is answered',
    async run(q, expect) {
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
    },
  },
  {
    name: 'asks once per key while the question is open',
    async run(q, expect) {
      const a = await q.ask({ topic: 'date', title: 'When was the trip?', key: 'trip-date' });
      const b = await q.ask({ topic: 'date', title: 'When was the trip?', key: 'trip-date' });
      expect(a).toEqual(b);
    },
  },
  {
    name: "delivers an answer to the asker's handler, also when it registers afterwards",
    async run(q, expect) {
      const id = await q.ask({ topic: 'later', title: 'Which café?', data: { note: 'n1' } });
      await q.answer(id, { text: 'Café Lumière' });
      const got: unknown[] = [];
      await q.handle('later', (a, question) => {
        got.push([a.text, question.data]);
      });
      await wait();
      expect(got).toEqual([['Café Lumière', { note: 'n1' }]]);
      // Delivered once, not again on the next registration.
      await q.handle('later', () => {
        got.push('again');
      });
      await wait();
      expect(got.length).toEqual(1);
    },
  },
  {
    name: 'refuses an answer that is not one of the choices',
    async run(q, expect) {
      const id = await q.ask({
        topic: 'pick',
        title: 'Pick one',
        choices: [{ id: 'a', label: 'A' }],
      });
      await expect(q.answer(id, { choice: 'b' })).rejects.toThrow();
      await expect(q.answer(id, { text: 'free text' })).rejects.toThrow();
    },
  },
  {
    name: 'lets the asker withdraw its question',
    async run(q, expect) {
      const id = await q.ask({ topic: 'x', title: 'Never mind' });
      await q.withdraw(id);
      expect((await q.get(id))?.status).toEqual('withdrawn');
    },
  },
]);

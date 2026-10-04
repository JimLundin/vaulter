// What every provider of notes@1 must do: keep each note as it was said, in order, and say when one is
// appended.
import { defineConformance } from '@vaulter/kernel';
import { notes } from './index.ts';

export default defineConformance(notes, [
  {
    name: 'keeps a note as it was, with when it was said',
    async run(n, t) {
      const a = await n.append({
        text: 'Coffee with Ada',
        source: 'voice',
        context: { place: 'café' },
      });
      t.equal([a.text, a.source, a.context], ['Coffee with Ada', 'voice', { place: 'café' }]);
      t.ok(!Number.isNaN(Date.parse(a.at)), 'at is a date-time');
      t.equal(await n.get(a.id), a);
      t.equal(await n.get('nope'), undefined);
    },
  },
  {
    name: 'refuses an empty note',
    async run(n, t) {
      await t.rejects(n.append({ text: '   ' }));
    },
  },
  {
    name: 'lists by when they were said, newest first, within a range',
    async run(n, t) {
      // One log for everyone: other checks' notes may be there too, so look at a range of its own.
      const range = { since: '2001-01-01T00:00:00.000Z', until: '2001-01-04T00:00:00.000Z' };
      await n.append({ text: 'b', at: '2001-01-02T10:00:00.000Z', source: 'import' });
      await n.append({ text: 'a', at: '2001-01-01T10:00:00.000Z', source: 'import' });
      await n.append({ text: 'c', at: '2001-01-03T10:00:00.000Z', source: 'import' });
      t.equal(
        (await n.list(range)).map((x) => x.text),
        ['c', 'b', 'a'],
      );
      t.equal(
        (await n.list({ ...range, order: 'oldest', limit: 2 })).map((x) => x.text),
        ['a', 'b'],
      );
      t.equal(
        (
          await n.list({ since: '2001-01-02T00:00:00.000Z', until: '2001-01-03T00:00:00.000Z' })
        ).map((x) => x.text),
        ['b'],
      );
    },
  },
  {
    name: 'tells a subscriber about each note appended',
    async run(n, t) {
      const seen: string[] = [];
      const stop = await n.onAppended((x) => {
        seen.push(x.text);
      });
      await n.append({ text: 'one' });
      await new Promise((ok) => setTimeout(ok, 20));
      stop();
      await n.append({ text: 'two' });
      await new Promise((ok) => setTimeout(ok, 20));
      t.equal(seen, ['one']);
    },
  },
]);

// What every provider of records@1 must do. The kernel runs it against a scratch instance before a
// provider may satisfy `requires: { records }`; CI runs it too (extensions/store-local/records.test.ts).
import { defineConformance } from '@pip/kernel';
import { z } from 'zod';
import { records } from './index.ts';

export default defineConformance(records, [
  {
    name: 'registers a type in the caller’s namespace and checks values against it',
    async run(r, t) {
      const person = r.registerType('person', { name: z.string(), age: z.number().optional() });
      t.ok(/^[\w-]+\/person$/.test(person.name), `namespaced: ${person.name}`);
      const p = await r.put(person, { name: 'Ada' });
      t.equal([p.name, p.type, p.v, p.created === p.updated], ['Ada', person.name, 1, true]);
      await t.rejects(r.put(person, { name: 1 } as never));
      t.equal(await r.get(person, p.id), p);
      t.equal(await r.get(person, 'nope'), undefined);
    },
  },
  {
    name: 'replaces a record put with its id, keeping when it was created',
    async run(r, t) {
      const thing = r.registerType('thing', { n: z.number() });
      const a = await r.put(thing, { n: 1 });
      const b = await r.put(thing, { id: a.id, n: 2 });
      t.equal([b.id, b.n, b.created], [a.id, 2, a.created]);
      t.equal((await r.query(thing)).length, 1);
    },
  },
  {
    name: 'queries newest first, by date, up to a limit',
    async run(r, t) {
      const ev = r.registerType('event', { n: z.number() });
      for (const n of [1, 2, 3]) await r.put(ev, { n });
      t.equal(
        (await r.query(ev)).map((x) => x.n),
        [3, 2, 1],
      );
      t.equal(
        (await r.query(ev, { order: 'oldest', limit: 2 })).map((x) => x.n),
        [1, 2],
      );
      t.equal(await r.query(ev, { since: '2999-01-01' }), []);
    },
  },
  {
    name: 'finds records by the words in their text fields',
    async run(r, t) {
      const place = r.registerType('place', { name: z.string(), area: z.string().optional() });
      await r.put(place, { name: 'Café Lumière', area: 'Södermalm' });
      await r.put(place, { name: 'The library' });
      t.equal(
        (await r.search([place], 'café söder')).map((x) => x.name),
        ['Café Lumière'],
      );
    },
  },
  {
    name: 'tells a subscriber about each change, until it unsubscribes',
    async run(r, t) {
      const w = r.registerType('watched', { n: z.number() });
      const seen: unknown[] = [];
      const stop = await r.onChanged(w, (c) => {
        seen.push('deleted' in c ? 'deleted' : c.n);
      });
      const a = await r.put(w, { n: 1 });
      await r.delete(w, a.id);
      await new Promise((ok) => setTimeout(ok, 20));
      stop();
      await r.put(w, { n: 2 });
      await new Promise((ok) => setTimeout(ok, 20));
      t.equal(seen, [1, 'deleted']);
    },
  },
  {
    name: 'merges two records, and the merged id reads as the one kept',
    async run(r, t) {
      const p = r.registerType('who', { name: z.string(), born: z.string().optional() });
      const a = await r.put(p, { name: 'Ada Lovelace' });
      const b = await r.put(p, { name: 'Ada', born: '1815' });
      const m = await r.merge(p, a.id, b.id);
      t.equal([m.id, m.name, m.born], [a.id, 'Ada Lovelace', '1815']);
      t.equal((await r.get(p, b.id))?.id, a.id);
      t.equal((await r.query(p)).length, 1);
    },
  },
  {
    name: 'migrates a type to a new version once, and can revert it',
    async run(r, t) {
      const v1 = r.registerType('spot', { place: z.string() });
      const old = await r.put(v1, { place: 'Café Lumière, Stockholm' });
      const v2 = r.registerType(
        'spot',
        { venue: z.string(), city: z.string() },
        {
          version: 2,
          migrate: {
            1: (o) => {
              const [venue, city] = String(o.place).split(', ');
              return { venue, city };
            },
          },
        },
      );
      const now = await r.get(v2, old.id);
      t.equal(
        [now?.venue, now?.city, now?.v, now?.created],
        ['Café Lumière', 'Stockholm', 2, old.created],
      );
      await r.revert(v2, 1);
      t.equal((await r.get(v1, old.id))?.place, 'Café Lumière, Stockholm');
    },
  },
  {
    name: 'refuses writes to another extension’s type',
    async run(r, t) {
      const foreign = {
        kind: 'record-type',
        name: 'someone-else/secret',
        schema: {},
        version: 1,
      } as const;
      await t.rejects(r.put(foreign, {}));
    },
  },
]);

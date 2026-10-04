// What every provider of records@1 must do. The kernel runs it against a scratch instance before a
// provider may satisfy `requires: { records }`; CI runs it too (extensions/store-local/records.test.ts).
import { defineConformance } from '@pip/kernel';
import { z } from 'zod';
import { records } from './index.ts';

const settle = () => new Promise((ok) => setTimeout(ok, 20));

export default defineConformance(records, [
  {
    name: 'registers a type in the caller’s namespace and checks values against it',
    async run(r, t) {
      const person = r.registerType('person', { name: z.string(), age: z.number().optional() });
      t.ok(/^[\w~-]+\/person$/.test(person.name), `namespaced: ${person.name}`);
      const p = await r.create(person, { name: 'Ada' });
      t.equal(
        [p.name, p.meta.type, p.meta.v, p.meta.rev, p.meta.created === p.meta.updated],
        ['Ada', person.name, 1, 1, true],
      );
      t.equal(Object.keys(p).sort(), ['id', 'meta', 'name']);
      await t.rejects(r.create(person, { name: 1 } as never));
      t.equal(await r.get(person, p.id), p);
      t.equal(await r.get(person, 'nope'), undefined);
    },
  },
  {
    name: 'creates a record with a chosen id once, and refuses that id again',
    async run(r, t) {
      const thing = r.registerType('thing', { n: z.number() });
      const a = await r.create(thing, { id: 'one', n: 1 });
      t.equal(a.id, 'one');
      await t.rejects(r.create(thing, { id: 'one', n: 2 }));
      t.equal((await r.get(thing, 'one'))?.n, 1);
    },
  },
  {
    name: 'updates a record as a new revision, keeping when it was created and every earlier one',
    async run(r, t) {
      const thing = r.registerType('thing', { n: z.number() });
      const a = await r.create(thing, { n: 1 });
      const b = await r.update(thing, a.id, (cur) => ({ n: cur.n + 1 }));
      t.equal([b.id, b.n, b.meta.rev, b.meta.created], [a.id, 2, 2, a.meta.created]);
      await r.update(thing, a.id, (cur) => ({ n: cur.n * 10 }));
      t.equal(
        (await r.history(thing, a.id)).map((h) => [h.n, h.meta.rev]),
        [
          [2, 2],
          [1, 1],
        ],
      );
      t.equal((await r.query(thing)).length, 1);
    },
  },
  {
    name: 'loses neither of two updates made at once',
    async run(r, t) {
      const counter = r.registerType('counter', { n: z.number(), by: z.array(z.string()) });
      const c = await r.create(counter, { n: 0, by: [] });
      const slow = (who: string) =>
        r.update(counter, c.id, async (cur) => {
          await new Promise((ok) => setTimeout(ok, 5));
          return { n: cur.n + 1, by: [...cur.by, who] };
        });
      await Promise.all([slow('a'), slow('b')]);
      const now = await r.get(counter, c.id);
      t.equal([now?.n, [...(now?.by ?? [])].sort(), now?.meta.rev], [2, ['a', 'b'], 3]);
    },
  },
  {
    name: 'queries by field values and ranges, ordered by a field or when, up to a limit',
    async run(r, t) {
      const ev = r.registerType('event', {
        n: z.number(),
        kind: z.string(),
        tags: z.array(z.string()),
      });
      for (const [n, kind, tags] of [
        [1, 'run', ['park']],
        [2, 'swim', []],
        [3, 'run', ['park', 'rain']],
      ] as const)
        await r.create(ev, { n, kind, tags: [...tags] });
      t.equal(
        (await r.query(ev)).map((x) => x.n),
        [3, 2, 1],
      );
      t.equal(
        (await r.query(ev, { where: { kind: 'run' }, order: 'asc' })).map((x) => x.n),
        [1, 3],
      );
      t.equal(
        (await r.query(ev, { where: { n: { gte: 2 }, tags: { has: 'park' } } })).map((x) => x.n),
        [3],
      );
      t.equal(
        (await r.query(ev, { where: { kind: { in: ['swim', 'yoga'] } } })).map((x) => x.n),
        [2],
      );
      t.equal(
        (await r.query(ev, { orderBy: 'n', order: 'asc', limit: 2 })).map((x) => x.n),
        [1, 2],
      );
      t.equal(await r.query(ev, { created: { gte: '2999-01-01' } }), []);
    },
  },
  {
    name: 'finds records by the words in their text fields, or in the fields asked for',
    async run(r, t) {
      const place = r.registerType('place', {
        name: z.string(),
        aliases: z.array(z.string()),
        notes: z.string().optional(),
      });
      await r.create(place, { name: 'Café Lumière', aliases: ['Lumière'], notes: 'Södermalm' });
      await r.create(place, { name: 'The library', aliases: [], notes: 'near the café' });
      t.equal(
        (await r.search([place], 'café söder')).map((x) => x.name),
        ['Café Lumière'],
      );
      t.equal(
        (await r.search([place], 'café', { fields: ['name', 'aliases'] })).map((x) => x.name),
        ['Café Lumière'],
      );
      t.equal(
        (await r.search([place], 'café')).map((x) => x.name),
        ['The library', 'Café Lumière'],
      );
      // Not the metadata: every record has a type and an id.
      t.equal(await r.search([place], place.name.split('/')[0]), []);
    },
  },
  {
    name: 'deletes to a tombstone, hidden unless asked for, which can be restored',
    async run(r, t) {
      const note = r.registerType('scrap', { text: z.string() });
      const a = await r.create(note, { text: 'keep me' });
      await r.delete(note, a.id);
      t.equal(await r.get(note, a.id), undefined);
      t.equal(await r.query(note), []);
      t.equal(await r.search([note], 'keep'), []);
      const tomb = await r.get(note, a.id, { deleted: true });
      t.ok(tomb?.meta.deleted, 'the tombstone says when');
      t.equal((await r.query(note, { deleted: true })).length, 1);
      const back = await r.restore(note, a.id);
      t.equal([back.text, back.meta.deleted, back.meta.rev], ['keep me', undefined, 3]);
    },
  },
  {
    name: 'tells a subscriber about each change, until it unsubscribes',
    async run(r, t) {
      const w = r.registerType('watched', { n: z.number() });
      const seen: unknown[] = [];
      const stop = await r.onChanged(w, (c) => {
        seen.push(c.meta.deleted ? 'deleted' : c.n);
      });
      const a = await r.create(w, { n: 1 });
      await r.delete(w, a.id);
      await settle();
      stop();
      await r.create(w, { n: 2 });
      await settle();
      t.equal(seen, [1, 'deleted']);
    },
  },
  {
    name: 'merges two records, and a merged id reads as the one kept, through a chain of merges',
    async run(r, t) {
      const p = r.registerType('who', { name: z.string(), born: z.string().optional() });
      const a = await r.create(p, { name: 'Ada Lovelace' });
      const b = await r.create(p, { name: 'Ada', born: '1815' });
      const c = await r.create(p, { name: 'Augusta Ada King' });
      const m = await r.merge(p, a.id, b.id);
      t.equal([m.id, m.name, m.born], [a.id, 'Ada Lovelace', '1815']);
      t.equal((await r.get(p, b.id))?.id, a.id);
      t.equal((await r.query(p)).length, 2);
      await r.merge(p, c.id, a.id);
      t.equal((await r.get(p, b.id))?.id, c.id);
      await t.rejects(r.merge(p, c.id, b.id), 'b already reads as c');
      t.equal((await r.get(p, b.id, { deleted: true }))?.meta.mergedInto, a.id);
    },
  },
  {
    name: 'migrates a type to a new version once, and can revert it, schema and all',
    async run(r, t) {
      const v1 = r.registerType('spot', { place: z.string() });
      const old = await r.create(v1, { place: 'Café Lumière, Stockholm' });
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
        [now?.venue, now?.city, now?.meta.v, now?.meta.created],
        ['Café Lumière', 'Stockholm', 2, old.meta.created],
      );
      const made = await r.create(v2, { venue: 'Bar', city: 'Oslo' });
      await r.revert(v2, 1);
      t.equal((await r.get(v1, old.id))?.place, 'Café Lumière, Stockholm');
      // The type takes version 1's fields again; a record made at version 2 is put away, not lost.
      await r.update(v1, old.id, () => ({ place: 'Café Lumière, Uppsala' }));
      t.equal(await r.get(v1, made.id), undefined);
      t.equal((await r.get(v2, made.id, { deleted: true }))?.venue, 'Bar');
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
      await t.rejects(r.create(foreign, {}));
    },
  },
]);

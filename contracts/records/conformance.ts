// What every provider of records must do: CI runs it against each one in the repo
// (contracts/conformance.test.ts).

import { z } from 'zod';
import { defineConformance, settle } from '../conformance.ts';
import type { RecordsV1 } from './index.ts';

export default defineConformance<RecordsV1>('recordsFor', [
  {
    name: 'registers a type in the caller’s namespace and checks values against it',
    async run(r, expect) {
      const person = await r.registerType('person', {
        name: z.string(),
        age: z.number().optional(),
      });
      expect(/^[\w~-]+\/person$/.test(person.name), `namespaced: ${person.name}`).toBeTruthy();
      const p = await r.create(person, { name: 'Ada' });
      expect([p.name, p.meta.type, p.meta.rev, p.meta.created === p.meta.updated]).toEqual([
        'Ada',
        person.name,
        1,
        true,
      ]);
      expect(Object.keys(p).sort((a, b) => a.localeCompare(b))).toEqual(['id', 'meta', 'name']);
      await expect(r.create(person, { name: 1 } as never)).rejects.toThrow();
      expect(await r.get(person, p.id)).toEqual(p);
      expect(await r.get(person, 'nope')).toEqual(undefined);
    },
  },
  {
    name: 'creates a record with a chosen id once, and refuses that id again',
    async run(r, expect) {
      const thing = await r.registerType('thing', { n: z.number() });
      const a = await r.create(thing, { id: 'one', n: 1 });
      expect(a.id).toEqual('one');
      await expect(r.create(thing, { id: 'one', n: 2 })).rejects.toThrow();
      expect((await r.get(thing, 'one'))?.n).toEqual(1);
    },
  },
  {
    name: 'updates a record as a new revision, keeping when it was created and every earlier one',
    async run(r, expect) {
      const thing = await r.registerType('thing', { n: z.number() });
      const a = await r.create(thing, { n: 1 });
      const b = await r.update(thing, a.id, (cur) => ({ n: cur.n + 1 }));
      expect([b.id, b.n, b.meta.rev, b.meta.created]).toEqual([a.id, 2, 2, a.meta.created]);
      await r.update(thing, a.id, (cur) => ({ n: cur.n * 10 }));
      expect((await r.history(thing, a.id)).map((h) => [h.n, h.meta.rev])).toEqual([
        [2, 2],
        [1, 1],
      ]);
      expect((await r.query(thing)).length).toEqual(1);
    },
  },
  {
    name: 'loses neither of two updates made at once',
    async run(r, expect) {
      const counter = await r.registerType('counter', { n: z.number(), by: z.array(z.string()) });
      const c = await r.create(counter, { n: 0, by: [] });
      const slow = (who: string) =>
        r.update(counter, c.id, async (cur) => {
          await new Promise((ok) => setTimeout(ok, 5));
          return { n: cur.n + 1, by: [...cur.by, who] };
        });
      await Promise.all([slow('a'), slow('b')]);
      const now = await r.get(counter, c.id);
      expect([now?.n, [...(now?.by ?? [])].sort(), now?.meta.rev]).toEqual([2, ['a', 'b'], 3]);
    },
  },
  {
    name: "queries by a field's value or range, ordered by a field or when, up to a limit",
    async run(r, expect) {
      const ev = await r.registerType('event', {
        n: z.number(),
        kind: z.string(),
        at: z.string().optional(),
      });
      for (const [n, kind, at] of [
        [1, 'run', '2026-01-01'],
        [2, 'swim', undefined],
        [3, 'run', '2026-03-01'],
      ] as const)
        await r.create(ev, { n, kind, ...(at ? { at } : {}) });
      expect((await r.query(ev)).map((x) => x.n)).toEqual([3, 2, 1]);
      expect((await r.query(ev, { where: { kind: 'run' }, order: 'asc' })).map((x) => x.n)).toEqual(
        [1, 3],
      );
      expect(
        (await r.query(ev, { where: { at: { gte: '2026-01-01', lt: '2026-02-01' } } })).map(
          (x) => x.n,
        ),
      ).toEqual([1]);
      expect((await r.query(ev, { orderBy: 'n', order: 'asc', limit: 2 })).map((x) => x.n)).toEqual(
        [1, 2],
      );
      // Without the field ordered by: last, in either order.
      expect((await r.query(ev, { orderBy: 'at' })).map((x) => x.n)).toEqual([3, 1, 2]);
      expect((await r.query(ev, { orderBy: 'at', order: 'asc' })).map((x) => x.n)).toEqual([
        1, 3, 2,
      ]);
    },
  },
  {
    name: 'finds records by the words in their text fields, or in the fields asked for',
    async run(r, expect) {
      const place = await r.registerType('place', {
        name: z.string(),
        aliases: z.array(z.string()),
        notes: z.string().optional(),
      });
      await r.create(place, { name: 'Café Lumière', aliases: ['Lumière'], notes: 'Södermalm' });
      await r.create(place, { name: 'The library', aliases: [], notes: 'near the café' });
      expect((await r.search([place], 'café söder')).map((x) => x.name)).toEqual(['Café Lumière']);
      expect(
        (await r.search([place], 'café', { fields: ['name', 'aliases'] })).map((x) => x.name),
      ).toEqual(['Café Lumière']);
      expect((await r.search([place], 'café')).map((x) => x.name)).toEqual([
        'The library',
        'Café Lumière',
      ]);
      // Not the metadata: every record has a type and an id.
      expect(await r.search([place], place.name.split('/')[0])).toEqual([]);
    },
  },
  {
    name: 'deletes to a tombstone, hidden unless asked for, which can be restored',
    async run(r, expect) {
      const note = await r.registerType('scrap', { text: z.string() });
      const a = await r.create(note, { text: 'keep me' });
      await r.delete(note, a.id);
      expect(await r.get(note, a.id)).toEqual(undefined);
      expect(await r.query(note)).toEqual([]);
      expect(await r.search([note], 'keep')).toEqual([]);
      const tomb = await r.get(note, a.id, { deleted: true });
      expect(tomb?.meta.deleted, 'the tombstone says when').toBeTruthy();
      expect((await r.query(note, { deleted: true })).length).toEqual(1);
      const back = await r.restore(note, a.id);
      expect([back.text, back.meta.deleted, back.meta.rev]).toEqual(['keep me', undefined, 3]);
    },
  },
  {
    name: 'tells a subscriber about each change, until it unsubscribes',
    async run(r, expect) {
      const w = await r.registerType('watched', { n: z.number() });
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
      expect(seen).toEqual([1, 'deleted']);
    },
  },
  {
    name: 'merges two records, and a merged id reads as the one kept, through a chain of merges',
    async run(r, expect) {
      const p = await r.registerType('who', { name: z.string(), born: z.string().optional() });
      const a = await r.create(p, { name: 'Ada Lovelace' });
      const b = await r.create(p, { name: 'Ada', born: '1815' });
      const c = await r.create(p, { name: 'Augusta Ada King' });
      const m = await r.merge(p, a.id, b.id);
      expect([m.id, m.name, m.born]).toEqual([a.id, 'Ada Lovelace', '1815']);
      expect((await r.get(p, b.id))?.id).toEqual(a.id);
      expect((await r.query(p)).length).toEqual(2);
      await r.merge(p, c.id, a.id);
      expect((await r.get(p, b.id))?.id).toEqual(c.id);
      await expect(r.merge(p, c.id, b.id), 'b already reads as c').rejects.toThrow();
      expect((await r.get(p, b.id, { deleted: true }))?.meta.mergedInto).toEqual(a.id);
    },
  },
  {
    name: 'refuses writes to another extension’s type',
    async run(r, expect) {
      const foreign = { kind: 'record-type', name: 'someone-else/secret' } as const;
      await expect(r.create(foreign, {})).rejects.toThrow();
    },
  },
]);

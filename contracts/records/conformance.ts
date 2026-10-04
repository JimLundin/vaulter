// What every provider of records@1 must do. A provider's own test runs it against a fresh instance:
// `recordsConformance(() => makeRecords('test-ext'))`.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { RecordsV1 } from './index.ts';

export function recordsConformance(make: () => RecordsV1 | Promise<RecordsV1>) {
  describe('records@1 conformance', () => {
    it('namespaces a type by the registering extension and checks values against it', async () => {
      const r = await make();
      const person = r.registerType('person', { name: z.string(), age: z.number().optional() });
      expect(person.name).toMatch(/\/person$/);
      const p = await r.put(person, { name: 'Ada' });
      expect(p).toMatchObject({ name: 'Ada', type: person.name });
      expect(p.id).toBeTruthy();
      expect(p.created).toBe(p.updated);
      await expect(r.put(person, { name: 1 } as never)).rejects.toThrow();
      expect(await r.get(person, p.id)).toEqual(p);
      expect(await r.get(person, 'nope')).toBeUndefined();
    });

    it('replaces a record put with its id, keeping when it was created', async () => {
      const r = await make();
      const t = r.registerType('thing', { n: z.number() });
      const a = await r.put(t, { n: 1 });
      const b = await r.put(t, { id: a.id, n: 2 });
      expect(b).toMatchObject({ id: a.id, n: 2, created: a.created });
      expect(await r.query(t)).toHaveLength(1);
    });

    it('queries newest first, since a date, up to a limit', async () => {
      const r = await make();
      const t = r.registerType('event', { n: z.number() });
      for (const n of [1, 2, 3]) await r.put(t, { n });
      expect((await r.query(t)).map((x) => x.n)).toEqual([3, 2, 1]);
      expect((await r.query(t, { order: 'oldest', limit: 2 })).map((x) => x.n)).toEqual([1, 2]);
      expect(await r.query(t, { since: '2999-01-01' })).toEqual([]);
    });

    it('finds records by the words in their text fields', async () => {
      const r = await make();
      const place = r.registerType('place', { name: z.string(), area: z.string().optional() });
      await r.put(place, { name: 'Café Lumière', area: 'Södermalm' });
      await r.put(place, { name: 'The library' });
      expect((await r.search([place], 'café söder')).map((x) => x.name)).toEqual(['Café Lumière']);
    });

    it('tells a subscriber about each change to a type', async () => {
      const r = await make();
      const t = r.registerType('watched', { n: z.number() });
      const seen: number[] = [];
      const stop = r.onChanged(t, (rec) => seen.push(rec.n));
      await r.put(t, { n: 1 });
      stop();
      await r.put(t, { n: 2 });
      expect(seen).toEqual([1]);
    });
  });
}

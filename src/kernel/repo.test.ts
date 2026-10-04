// The repo's own contracts and extensions, started by the kernel.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { Kernel } from './kernel.ts';
import { startTree } from './testing.ts';

const ROOT = join(import.meta.dirname, '../..');
const read = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(join(ROOT, d))) {
      const p = `${d}/${name}`;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
        out[p] = readFileSync(join(ROOT, p), 'utf8');
    }
  };
  walk(dir);
  return out;
};

let kernel: Kernel | undefined;
afterEach(async () => {
  await kernel?.dispose();
});

it('starts store-local and serves another extension its records', async () => {
  const files = {
    ...read('contracts'),
    ...read('extensions/store-local'),
    'extensions/people/index.ts': `
      import { defineExtension } from '@pip/kernel';
      import { records } from '@contracts/records';
      import { z } from 'zod';
      export default defineExtension({
        id: 'people', version: '1.0.0', requires: { records },
        async setup({ records }, kernel) {
          const v1 = await records.registerType('person', { name: z.string() });
          const ada = await records.create(v1, { name: 'Ada Lovelace' });
          const v2 = await records.registerType('person', { first: z.string(), last: z.string() }, {
            version: 2,
            migrate: { 1: (o) => { const [first, last] = String(o.name).split(' '); return { first, last }; } },
          });
          const seen = [];
          await records.onChanged(v2, (c) => { seen.push(c.first); });
          await records.create(v2, { first: 'Grace', last: 'Hopper' });
          await new Promise((ok) => setTimeout(ok, 20));
          await kernel.storage.set('result', { ada: await records.get(v2, ada.id), all: (await records.query(v2)).length, seen });
        },
      });`,
  };
  const r = await startTree(files);
  kernel = r.kernel;
  expect(r.refused).toEqual([]);
  expect(kernel.running().map((x) => x.id)).toEqual(['store-local', 'people']);
  const result = (await r.storage.get('people', 'result')) as {
    ada: Record<string, unknown>;
    all: number;
    seen: string[];
  };
  expect(result.ada).toMatchObject({
    first: 'Ada',
    last: 'Lovelace',
    meta: { v: 2, rev: 2, type: 'people/person' },
  });
  expect(result.all).toBe(2);
  expect(result.seen).toEqual(['Grace']);
  // The records live in store-local's namespace, under people's.
  const keys = (await r.storage.list('store-local', 'r:')).map(([k]) => k.split(':')[1]);
  expect(new Set(keys)).toEqual(new Set(['people/person']));
});

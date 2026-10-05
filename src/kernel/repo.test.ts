// The repo's own contracts and extensions, started by the kernel.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { records } from '@contracts/records';
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
      import { defineExtension } from '@vaulter/kernel';
      import { out } from '@vaulter/test';
      import { records } from '@contracts/records';
      import { z } from 'zod';
      export default defineExtension({
        id: 'people', version: '1.0.0', requires: { records },
        async setup({ records }, kernel) {
          const person = await records.registerType('person', { first: z.string(), last: z.string() });
          const ada = await records.create(person, { first: 'Ada', last: 'Lovelace' });
          const seen = [];
          await records.onChanged(person, (c) => { seen.push(c.first); });
          await records.create(person, { first: 'Grace', last: 'Hopper' });
          await new Promise((ok) => setTimeout(ok, 20));
          await out.set('people', 'result', { ada: await records.get(person, ada.id), all: (await records.query(person)).length, seen });
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
    meta: { rev: 1, type: 'people/person' },
  });
  expect(result.all).toBe(2);
  expect(result.seen).toEqual(['Grace']);
  // Removing people removes its records with store-local.
  const person = { kind: 'record-type', name: 'people/person' } as const;
  const reader = kernel.caller('check-1');
  expect(await reader.use(records, 'store-local').query(person)).toHaveLength(2);
  await kernel.remove('people');
  expect(await reader.use(records, 'store-local').query(person)).toEqual([]);
});

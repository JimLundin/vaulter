import { afterEach, expect, it } from 'vitest';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(async () => {
  await kernel?.dispose();
});

it('keeps notes as records, and tells requirers', async () => {
  const r = await startRepo(['store-local', 'notes'], {
    'extensions/voice/index.ts': `
      import { defineExtension } from '#kernel';
      import { out } from '#test';
      import { notes } from '#contracts/notes';
      export default defineExtension({ id: 'voice', version: '1.0.0', requires: { notes },
        async setup({ notes }, kernel) {
          const heard = [];
          await notes.onAppended((n) => { heard.push(n.text); });
          const n = await notes.append({ text: 'Lunch with Ada at Café Lumière', source: 'voice' });
          await new Promise((ok) => setTimeout(ok, 20));
          await out.set('voice', 'out', { n, list: await notes.list(), heard });
        } });`,
  });
  ({ kernel } = r);
  expect(r.refused).toEqual([]);
  expect(kernel.running().map((x) => x.id)).toEqual(['store-local', 'notes', 'voice']);
  const out = (await r.out.get('voice', 'out')) as {
    n: { id: string; text: string };
    list: { id: string }[];
    heard: string[];
  };
  expect(out.n.text).toBe('Lunch with Ada at Café Lumière');
  expect(out.list.map((x) => x.id)).toEqual([out.n.id]);
  expect(out.heard).toEqual(['Lunch with Ada at Café Lumière']);
});

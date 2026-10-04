import { afterEach, expect, it } from 'vitest';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(() => kernel?.dispose());

it('starts after notes@1 conformance, keeps notes as records, and tells requirers', async () => {
  const r = await startRepo(['store-local', 'notes'], {
    'extensions/voice/index.ts': `
      import { defineExtension } from '@pip/kernel';
      import { notes } from '@contracts/notes';
      export default defineExtension({ id: 'voice', version: '1.0.0', requires: { notes },
        async setup({ notes }, kernel) {
          const heard = [];
          await notes.onAppended((n) => { heard.push(n.text); });
          const n = await notes.append({ text: 'Lunch with Ada at Café Lumière', source: 'voice' });
          await new Promise((ok) => setTimeout(ok, 20));
          await kernel.storage.set('out', { n, list: await notes.list(), heard });
        } });`,
  });
  kernel = r.kernel;
  expect(r.refused).toEqual([]);
  expect(kernel.running().map((x) => x.id)).toEqual(['store-local', 'notes', 'voice']);
  const out = (await r.storage.get('voice', 'out')) as {
    n: { id: string; text: string };
    list: { id: string }[];
    heard: string[];
  };
  expect(out.n.text).toBe('Lunch with Ada at Café Lumière');
  expect(out.list.map((x) => x.id)).toEqual([out.n.id]);
  expect(out.heard).toEqual(['Lunch with Ada at Café Lumière']);
  // Kept by store-local, in notes' namespace; the conformance runs left nothing behind.
  const keys = (await r.storage.list('store-local', 'r:')).map(([k]) => k.split(':')[1]);
  expect(keys).toEqual(['notes/note']);
});

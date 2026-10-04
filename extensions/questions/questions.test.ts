import { afterEach, expect, it } from 'vitest';
import { defineContract } from '../../src/kernel/contract.ts';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(async () => {
  await kernel?.dispose();
});

const probe = defineContract<{ run: (a?: string) => Promise<unknown> }>({
  name: 'probe',
  version: '1.0.0',
});

it('lets only a person answer a question, and hands the answer to the asker', async () => {
  let present = '';
  const r = await startRepo(
    ['store-local', 'questions'],
    {
      'contracts/probe/index.ts': `import { defineContract } from '@pip/kernel';
        export const probe = defineContract<{ run(a?: string): Promise<unknown> }>({ name: 'probe', version: '1.0.0' });`,
      'extensions/pip/index.ts': `import { defineExtension } from '@pip/kernel';
        import { questions } from '@contracts/questions';
        import { probe } from '@contracts/probe';
        export default defineExtension({ id: 'pip', version: '1.0.0', requires: { questions }, provides: { probe },
          async setup({ questions }, kernel) {
            await questions.handle('merge', async (a) => { await kernel.storage.set('answer', a.choice); });
            return { probe: { async run(id) {
              if (!id) return questions.ask({ topic: 'merge', title: 'Same Ada?', choices: [{ id: 'yes', label: 'Yes' }] });
              try { await questions.answer(id, { choice: 'yes' }); return 'answered'; } catch (e) { return e.message; }
            } } };
          } });`,
    },
    { presence: { grant() {}, take: (caller) => caller === present } },
  );
  kernel = r.kernel;
  expect(r.refused).toEqual([]);
  const p = kernel.use(probe);
  const id = (await p.run()) as string;
  expect(await p.run(id)).toBe(
    'questions@1.answer is for a person to do, right after a tap or key',
  );
  present = 'pip';
  expect(await p.run(id)).toBe('answered');
  await new Promise((ok) => setTimeout(ok, 30));
  expect(await r.storage.get('pip', 'answer')).toBe('yes');
});

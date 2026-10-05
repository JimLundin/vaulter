import { expect, it } from 'vitest';
import { questions } from '#contracts/questions';
import { probe, startRepo } from '../../src/kernel/testing.ts';

it('lets only a person answer a question, and hands the answer to the asker', async () => {
  let present = '';
  const r = await startRepo(
    ['store-local', 'questions'],
    {
      'extensions/asker/index.ts': `import { defineExtension } from '#kernel';
        import { out, probe } from '#test';
        import { questions } from '#contracts/questions';
        export default defineExtension({ id: 'asker', version: '1.0.0', requires: { questions }, provides: { probe },
          async setup({ questions }) {
            await questions.handle('merge', async (a) => { await out.set('asker', 'answer', a.choice); });
            return { probe: { async run(id) {
              if (!id) return questions.ask({ topic: 'merge', title: 'Same Ada?', choices: [{ id: 'yes', label: 'Yes' }] });
              try { await questions.answer(id, { choice: 'yes' }); return 'answered'; } catch (e) { return e.message; }
            } } };
          } });`,
    },
    { presence: { grant: () => undefined, take: (caller) => caller === present } },
  );
  const { kernel } = r;
  expect(r.refused).toEqual([]);
  const p = kernel.use(probe);
  const id = (await p.run()) as string;
  expect(await p.run(id)).toBe(
    'questions@1.answer is for a person to do, right after a tap or key',
  );
  present = 'asker';
  expect(await p.run(id)).toBe('answered');
  expect(await r.out.get('asker', 'answer')).toBe('yes');
});

it("keeps a person's answer when the asker's handler fails, and delivers it again later", async () => {
  const asker = (fails: boolean) => `import { defineExtension } from '#kernel';
    import { out, probe } from '#test';
    import { questions } from '#contracts/questions';
    export default defineExtension({ id: 'asker', version: '1.0.0', requires: { questions }, provides: { probe },
      async setup({ questions }) {
        await questions.handle('merge', async (a) => {
          if (${fails}) throw new Error('the asker broke');
          await out.set('asker', 'answer', a.choice);
        });
        return { probe: { run: () => questions.ask({ topic: 'merge', title: 'Same Ada?', choices: [{ id: 'yes', label: 'Yes' }] }) } };
      } });`;
  const files = (fails: boolean) => ({
    'extensions/asker/index.ts': asker(fails),
  });
  const before = await startRepo(['store-local', 'questions'], files(true));
  const id = (await before.kernel.use(probe).run()) as string;
  // As the kernel calls it for a person: the answer is kept though the handler throws.
  await before.kernel.use(questions).answer(id, { choice: 'yes' });
  expect((await before.kernel.use(questions).get(id))?.status).toBe('answered');
  before.kernel.dispose();

  // The asker registers its handler again on starting, and is handed the answer then.
  const after = await startRepo(['store-local', 'questions'], files(false));
  expect(await after.out.get('asker', 'answer')).toBe('yes');
});

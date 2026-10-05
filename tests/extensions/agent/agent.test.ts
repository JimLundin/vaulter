import { expect, it, vi } from 'vitest';
import type { Step } from '#extensions/agent';
import type { Fn, Model } from '#extensions/openai';
import { startApp } from '../../app.ts';

// A model that follows a script: call one function, then answer from what came back. It keeps the
// functions it was offered each time.
const offered: string[][] = [];
const scripted: Pick<Model, 'answer'> = {
  async answer({ prompt, fns = [], onCall }) {
    offered.push(fns.map((f) => f.name));
    const call = async (name: string, input: unknown) => {
      const fn = fns.find((f) => f.name === name) as Fn;
      const output = await fn.call(fn.input.parse(input));
      await onCall?.({ name, input, output });
      return output;
    };
    const usage = { input: 1, output: 1 };
    if (prompt.startsWith('Who')) {
      const found = (await call('wiki__findPages', { query: 'Ada' })) as {
        name: string;
        summary: string;
      }[];
      return { text: found.map((p) => `${p.name}: ${p.summary}`).join('; '), calls: [], usage };
    }
    const { keep, merge } = JSON.parse(prompt.slice(prompt.indexOf('{')));
    const out = (await call('wiki__mergePages', { keep, merge })) as { asked?: string };
    return { text: out.asked ? 'Asked you first' : 'Merged', calls: [], usage };
  },
};
vi.doMock('#extensions/openai', () => ({ model: scripted }));

const start = async () => {
  await startApp(['wiki', 'agent']);
  return {
    pages: (await import('#extensions/wiki')).wiki,
    vaulter: (await import('#extensions/agent')).agent,
    asked: (await import('#extensions/questions')).questionsFor('screen'),
  };
};

it('answers with the tools it opens, and asks the person before a tool that asks first', async () => {
  const { pages, vaulter, asked } = await start();
  const ada = await pages.create('person', { name: 'Ada', summary: 'A friend from Uppsala.' });
  const dup = await pages.create('person', { name: 'Ada L.' });

  const steps: Step[] = [];
  const a = await vaulter.ask({ prompt: 'Who is Ada?' }, (s) => {
    steps.push(s);
  });
  expect(a.text).toBe('Ada L.: ; Ada: A friend from Uppsala.');
  expect(steps.map((s) => `${s.extension}.${s.tool}`)).toEqual(['wiki.findPages']);
  expect(offered[0]).toContain('wiki__mergePages');

  const refs = { keep: { type: ada.type, id: ada.id }, merge: { type: dup.type, id: dup.id } };
  const merge = () => vaulter.ask({ prompt: `Merge these: ${JSON.stringify(refs)}` });
  expect((await merge()).text).toBe('Asked you first');
  // Nothing changes until the person says yes: then the call is made.
  expect((await pages.get(refs.merge))?.id).toBe(dup.id);
  const [q] = await asked.open();
  expect(q).toMatchObject({
    from: 'agent',
    topic: 'approve',
    title: "May Vaulter use wiki's mergePages?",
  });
  await asked.answer(q.id, { choice: 'yes' });
  expect((await pages.get(refs.keep))?.aliases).toEqual(['Ada L.']);
  expect(await pages.get(refs.merge)).toBeUndefined();

  // Asked again, and the person says no: nothing is made.
  const other = await pages.create('person', { name: 'Grace' });
  refs.merge = { type: other.type, id: other.id };
  await merge();
  const [again] = await asked.open();
  await asked.answer(again.id, { choice: 'no' });
  expect((await pages.get(refs.merge))?.id).toBe(other.id);
});

it('makes an approved call after a restart, from the question alone', async () => {
  const before = await start();
  const ada = await before.pages.create('person', { name: 'Ada' });
  const dup = await before.pages.create('person', { name: 'Ada L.' });
  const refs = { keep: { type: ada.type, id: ada.id }, merge: { type: dup.type, id: dup.id } };
  await before.vaulter.ask({ prompt: `Merge these: ${JSON.stringify(refs)}` });

  // The app starts again (storage's database is still this device's), and the person says yes.
  const after = await start();
  const [q] = await after.asked.open();
  await after.asked.answer(q.id, { choice: 'yes' });
  expect(await after.pages.get(refs.merge)).toBeUndefined();
});

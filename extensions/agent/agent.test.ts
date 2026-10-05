import { expect, it } from 'vitest';
import { agent, type Step } from '#contracts/agent';
import { questions } from '#contracts/questions';
import { wiki } from '#contracts/wiki';
import { startRepo } from '../../src/kernel/testing.ts';

// A model that follows a script: open the wiki, use a tool, then answer from what came back.
const SCRIPTED = `
import { defineExtension } from '#kernel';
import { out } from '#test';
import { chat } from '#contracts/ai.chat';
const say = (content) => ({ content, toolCalls: [], usage: { input: 1, output: 1 } });
const call = (name, args) => ({ content: null, toolCalls: [{ id: 'c' + Math.random(), name, arguments: JSON.stringify(args) }], usage: { input: 1, output: 1 }, state: [{ type: 'reasoning', id: 'r1' }] });
export default defineExtension({ id: 'fake-ai', version: '1.0.0', provides: { chat },
  setup() { return { chat: {
    async complete(req) {
      const log = (await out.get('fake-ai', 'tools')) ?? [];
      await out.set('fake-ai', 'tools', [...log, req.tools.map((t) => t.name)]);
      const prompt = req.messages.filter((m) => m.role === 'user').at(-1).content;
      const tools = req.messages.filter((m) => m.role === 'tool');
      const last = tools.at(-1) && JSON.parse(tools.at(-1).content);
      if (!tools.length) return call('open_extension', { id: 'wiki' });
      if (prompt.startsWith('Who')) {
        if (last.opened) return call('wiki__findPages', { query: 'Ada' });
        return say(last.map((p) => p.name + ': ' + p.summary).join('; '));
      }
      const { keep, merge } = JSON.parse(prompt.slice(prompt.indexOf('{')));
      if (last.opened) return call('wiki__mergePages', { keep, merge });
      return say(last.asked ? 'Asked you first' : 'Not merged: ' + last.error);
    },
  } }; } });`;

it('answers with the tools it opens, and asks the person before a tool that asks first', async () => {
  const r = await startRepo(['store-local', 'notes', 'questions', 'wiki', 'agent'], {
    'extensions/fake-ai/index.ts': SCRIPTED,
  });
  const { kernel } = r;
  expect(r.refused).toEqual([]);
  const pages = kernel.use(wiki);
  const vaulter = kernel.use(agent);
  const ada = await pages.create('person', { name: 'Ada', summary: 'A friend from Uppsala.' });
  const dup = await pages.create('person', { name: 'Ada L.' });

  const steps: Step[] = [];
  const a = await vaulter.ask({ prompt: 'Who is Ada?' }, (s) => {
    steps.push(s);
  });
  expect(a.text).toBe('Ada L.: ; Ada: A friend from Uppsala.');
  expect(
    steps.map((s) => (s.kind === 'open' ? `open ${s.extension}` : `${s.extension}.${s.tool}`)),
  ).toEqual(['open wiki', 'wiki.findPages']);
  // The wiki's tools appear only once it is opened.
  const offered = (await r.out.get('fake-ai', 'tools')) as string[][];
  expect(offered[0]).toEqual(['open_extension']);
  expect(offered[1]).toContain('wiki__findPages');

  const refs = { keep: { type: ada.type, id: ada.id }, merge: { type: dup.type, id: dup.id } };
  const asked = kernel.use(questions);
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
  expect((await pages.get(refs.merge))?.id).toBe(ada.id);

  // Asked again, and the person says no: nothing is made.
  const other = await pages.create('person', { name: 'Grace' });
  refs.merge = { type: other.type, id: other.id };
  await merge();
  const [again] = await asked.open();
  await asked.answer(again.id, { choice: 'no' });
  expect((await pages.get(refs.merge))?.id).toBe(other.id);
});

it('makes an approved call after a restart, from the question alone', async () => {
  const repo = ['store-local', 'notes', 'questions', 'wiki', 'agent'];
  const before = await startRepo(repo, { 'extensions/fake-ai/index.ts': SCRIPTED });
  const pages = before.kernel.use(wiki);
  const ada = await pages.create('person', { name: 'Ada' });
  const dup = await pages.create('person', { name: 'Ada L.' });
  const refs = { keep: { type: ada.type, id: ada.id }, merge: { type: dup.type, id: dup.id } };
  await before.kernel.use(agent).ask({ prompt: `Merge these: ${JSON.stringify(refs)}` });
  before.kernel.dispose();

  // The app starts again (store-local's database is still this device's), and the person says yes.
  const after = await startRepo(repo, { 'extensions/fake-ai/index.ts': SCRIPTED });
  const asked = after.kernel.use(questions);
  const [q] = await asked.open();
  await asked.answer(q.id, { choice: 'yes' });
  expect((await after.kernel.use(wiki).get(refs.merge))?.id).toBe(ada.id);
});

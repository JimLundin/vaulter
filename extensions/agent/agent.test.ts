import { expect, it, vi } from 'vitest';
import type { Step } from '#contracts/agent';
import type { ChatResult, ChatV1 } from '#contracts/ai.chat';
import { startApp } from '../../src/kernel/testing.ts';

// A model that follows a script: open the wiki, use a tool, then answer from what came back. It keeps
// the tools it was offered each time.
const offered: string[][] = [];
const say = (content: string): ChatResult => ({
  content,
  toolCalls: [],
  usage: { input: 1, output: 1 },
});
const call = (name: string, args: unknown): ChatResult => ({
  content: null,
  toolCalls: [{ id: `c${Math.random()}`, name, arguments: JSON.stringify(args) }],
  usage: { input: 1, output: 1 },
  state: [{ type: 'reasoning', id: 'r1' }],
});
const scripted: ChatV1 = {
  complete(req) {
    offered.push((req.tools ?? []).map((t) => t.name));
    const prompt = String(req.messages.filter((m) => m.role === 'user').at(-1)?.content);
    const results = req.messages.filter((m) => m.role === 'tool');
    const last = results.length ? JSON.parse(String(results.at(-1)?.content)) : undefined;
    if (!last) return Promise.resolve(call('open_extension', { id: 'wiki' }));
    if (prompt.startsWith('Who')) {
      if (last.opened) return Promise.resolve(call('wiki__findPages', { query: 'Ada' }));
      const found = last as { name: string; summary: string }[];
      return Promise.resolve(say(found.map((p) => `${p.name}: ${p.summary}`).join('; ')));
    }
    const { keep, merge } = JSON.parse(prompt.slice(prompt.indexOf('{')));
    if (last.opened) return Promise.resolve(call('wiki__mergePages', { keep, merge }));
    return Promise.resolve(say(last.asked ? 'Asked you first' : `Not merged: ${last.error}`));
  },
};
vi.doMock('#chat', () => ({ chat: scripted }));

const start = async () => {
  await startApp(['wiki', 'agent']);
  return {
    pages: (await import('#wiki')).wiki,
    vaulter: (await import('#agent')).agent,
    asked: (await import('#questions')).questionsFor('screen'),
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
  expect(
    steps.map((s) => (s.kind === 'open' ? `open ${s.extension}` : `${s.extension}.${s.tool}`)),
  ).toEqual(['open wiki', 'wiki.findPages']);
  // The wiki's tools appear only once it is opened.
  expect(offered[0]).toEqual(['open_extension']);
  expect(offered[1]).toContain('wiki__findPages');

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
  const before = await start();
  const ada = await before.pages.create('person', { name: 'Ada' });
  const dup = await before.pages.create('person', { name: 'Ada L.' });
  const refs = { keep: { type: ada.type, id: ada.id }, merge: { type: dup.type, id: dup.id } };
  await before.vaulter.ask({ prompt: `Merge these: ${JSON.stringify(refs)}` });

  // The app starts again (store-local's database is still this device's), and the person says yes.
  const after = await start();
  const [q] = await after.asked.open();
  await after.asked.answer(q.id, { choice: 'yes' });
  expect((await after.pages.get(refs.merge))?.id).toBe(ada.id);
});

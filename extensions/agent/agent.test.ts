import { afterEach, expect, it, vi } from 'vitest';
import type { AgentV1, Step } from '../../contracts/agent/index.ts';
import type { WikiV1 } from '../../contracts/wiki/index.ts';
import { defineContract } from '../../src/kernel/contract.ts';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(async () => {
  await kernel?.dispose();
});

// A model that follows a script: open the wiki, use a tool, then answer from what came back.
const SCRIPTED = `
import { defineExtension } from '@vaulter/kernel';
import { out } from '@vaulter/test';
import { chat } from '@contracts/ai.chat';
const say = (content) => ({ content, toolCalls: [], usage: { input: 1, output: 1 } });
const call = (name, args) => ({ content: null, toolCalls: [{ id: 'c' + Math.random(), name, arguments: JSON.stringify(args) }], usage: { input: 1, output: 1 }, state: [{ type: 'reasoning', id: 'r1' }] });
export default defineExtension({ id: 'fake-ai', version: '1.0.0', provides: { chat },
  setup(_, kernel) { return { chat: {
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
      return say(last.error ? 'Not merged: ' + last.error : 'Merged into ' + last.name);
    },
  } }; } });`;

const use = <T>(k: Kernel, name: string) => k.use(defineContract<T>({ name, version: 1 }));

it('answers with the tools it opens, and waits for the person on a tool that asks', async () => {
  const r = await startRepo(['store-local', 'notes', 'wiki', 'agent'], {
    'extensions/fake-ai/index.ts': SCRIPTED,
  });
  kernel = r.kernel;
  expect(r.refused).toEqual([]);
  const wiki = use<WikiV1>(kernel, 'wiki');
  const agent = use<AgentV1>(kernel, 'agent');
  const ada = await wiki.create('person', { name: 'Ada', summary: 'A friend from Uppsala.' });
  const dup = await wiki.create('person', { name: 'Ada L.' });

  const steps: Step[] = [];
  const a = await agent.ask({ prompt: 'Who is Ada?' }, (s) => {
    steps.push(s);
  });
  expect(a.text).toBe('Ada L.: ; Ada: A friend from Uppsala.');
  expect(
    steps.map((s) => (s.kind === 'open' ? `open ${s.extension}` : `${s.extension}.${s.tool}`)),
  ).toEqual(['open wiki', 'wiki.findPages']);
  // The wiki's tools appear only once it is opened.
  const offered = (await r.storage.get('fake-ai', 'tools')) as string[][];
  expect(offered[0]).toEqual(['open_extension']);
  expect(offered[1]).toContain('wiki__findPages');

  const refs = { keep: { type: ada.type, id: ada.id }, merge: { type: dup.type, id: dup.id } };
  const merging = agent.ask({ prompt: `Merge these: ${JSON.stringify(refs)}` });
  await vi.waitFor(() => expect(kernel!.policy.approvals()).toHaveLength(1), { timeout: 2000 });
  expect(kernel.policy.approvals()[0]).toMatchObject({
    from: 'agent',
    to: 'wiki',
    label: 'tool:mergePages',
  });
  kernel.policy.decide(kernel.policy.approvals()[0].id, true);
  expect((await merging).text).toBe('Merged into Ada');
  expect((await wiki.get(refs.keep))?.aliases).toEqual(['Ada L.']);

  const declined = agent.ask({ prompt: `Merge these: ${JSON.stringify(refs)}` });
  await vi.waitFor(() => expect(kernel!.policy.approvals()).toHaveLength(1), { timeout: 2000 });
  kernel.policy.decide(kernel.policy.approvals()[0].id, false);
  expect((await declined).text).toBe('Not merged: the person declined');
});

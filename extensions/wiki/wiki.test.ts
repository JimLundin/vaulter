import { afterEach, expect, it, vi } from 'vitest';
import type { NotesV1 } from '../../contracts/notes/index.ts';
import type { QuestionsV1 } from '../../contracts/questions/index.ts';
import type { WikiV1 } from '../../contracts/wiki/index.ts';
import { defineContract } from '../../src/kernel/contract.ts';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(async () => {
  await kernel?.dispose();
});

// A model that files notes the way the instructions ask, by looking at the note and the pages sent.
const FAKE_AI = `
import { defineExtension } from '@vaulter/kernel';
import { chat } from '@contracts/ai.chat';
const none = { create: [], add: [], summaries: [] };
export default defineExtension({ id: 'fake-ai', version: '1.0.0', provides: { chat },
  setup(_, kernel) { return { chat: {
    async complete(req) {
      const { note, pages } = JSON.parse(req.messages[1].content);
      const id = (name) => pages.find((p) => p.name === name)?.id;
      let plan = { ...none, ask: [] };
      if (note.text.startsWith('Lunch'))
        plan = { ...plan,
          create: [
            { ref: 'n1', kind: 'person', name: 'Ada', aliases: [], facts: [{ text: 'Had lunch at Café Lumière', at: null }] },
            { ref: 'n2', kind: 'place', name: 'Café Lumière', aliases: ['Lumière'], facts: [] },
          ],
          summaries: [{ id: 'n1', summary: 'A friend.' }] };
      if (note.text.startsWith('Ada'))
        plan = { ...plan,
          add: [{ id: id('Ada'), facts: [{ text: 'Birthday in December', at: null }] }],
          ask: [{ title: 'Is "the café" Café Lumière?', body: null,
            yes: { ...none, add: [{ id: id('Café Lumière'), facts: [{ text: 'Ada likes it', at: null }] }] },
            no: { ...none, create: [{ ref: 'n3', kind: 'place', name: 'The café', aliases: [], facts: [] }] } }] };
      return { content: JSON.stringify(plan), toolCalls: [], usage: { input: 0, output: 0 } };
    },
  } }; } });`;

// An agent that only keeps the tools it is given.
const FAKE_AGENT = `
import { defineExtension } from '@vaulter/kernel';
import { out } from '@vaulter/test';
import { agentTools } from '@contracts/agent.tools';
import { z } from 'zod';
export default defineExtension({ id: 'agent', version: '1.0.0', provides: { agentTools },
  setup(_, kernel) { const tools = []; return { agentTools: {
    async add(t) { tools.push({ name: t.name, access: t.run.level, input: z.toJSONSchema(t.input) }); await out.set('agent', 'tools', tools); return () => {}; },
  } }; } });`;

const use = <T>(k: Kernel, name: string) => k.use(defineContract<T>({ name, version: 1 }));
const settle = () => new Promise((ok) => setTimeout(ok, 50));

it('revises pages from notes, cites every fact, asks when unsure, and gives Vaulter its tools', async () => {
  const r = await startRepo(['store-local', 'notes', 'questions', 'wiki'], {
    'extensions/fake-ai/index.ts': FAKE_AI,
    'extensions/agent/index.ts': FAKE_AGENT,
  });
  ({ kernel } = r);
  expect(r.refused).toEqual([]);
  const notes = use<NotesV1>(kernel, 'notes');
  const wiki = use<WikiV1>(kernel, 'wiki');
  const questions = use<QuestionsV1>(kernel, 'questions');

  const n1 = await notes.append({ text: 'Lunch with Ada at Café Lumière' });
  // The revision runs on its own once the note is appended: wait for it to have written the page.
  await vi.waitFor(
    async () =>
      expect(await wiki.find('Ada', ['person'])).toMatchObject([
        { kind: 'person', name: 'Ada', summary: 'A friend.' },
      ]),
    { timeout: 2000 },
  );
  const [ada] = await wiki.find('Ada', ['person']);
  expect(ada.facts.map((f) => [f.text, f.sources])).toEqual([
    ['Had lunch at Café Lumière', [n1.id]],
  ]);
  // Found by an alias too.
  expect((await wiki.find('lumière')).map((e) => e.name)).toEqual(['Café Lumière']);

  const n2 = await notes.append({
    text: 'Ada said her birthday is in December; we met at the café',
  });
  await vi.waitFor(async () => expect(await questions.open()).toHaveLength(1), { timeout: 2000 });
  expect((await wiki.get({ type: ada.type, id: ada.id }))?.facts.map((f) => f.text)).toEqual([
    'Had lunch at Café Lumière',
    'Birthday in December',
  ]);
  const [q] = await questions.open();
  expect(q).toMatchObject({
    from: 'wiki',
    topic: 'revise',
    title: 'Is "the café" Café Lumière?',
    notes: [n2.id],
  });
  await questions.answer(q.id, { choice: 'yes' });
  await settle();
  const [cafe] = await wiki.find('Café Lumière', ['place']);
  expect(cafe.facts.map((f) => [f.text, f.sources])).toEqual([['Ada likes it', [n2.id]]]);
  expect((await wiki.citing(n2.id)).map((e) => e.name).sort()).toEqual(['Ada', 'Café Lumière']);

  // Merging folds the facts and aliases together, and what pointed at the merged page follows.
  const dup = await wiki.create('person', { name: 'Ada L.' });
  await wiki.addFact(
    { type: dup.type, id: dup.id },
    { text: 'Works in Uppsala', sources: [n1.id] },
  );
  const trip = await wiki.create('event', {
    name: 'Trip',
    people: [{ type: dup.type, id: dup.id }],
  });
  const merged = await wiki.merge({ type: ada.type, id: ada.id }, { type: dup.type, id: dup.id });
  expect(merged.aliases).toEqual(['Ada L.']);
  expect(merged.facts.map((f) => f.text)).toEqual([
    'Had lunch at Café Lumière',
    'Birthday in December',
    'Works in Uppsala',
  ]);
  expect((await wiki.get({ type: trip.type, id: trip.id }))?.people).toEqual([
    { type: ada.type, id: ada.id },
  ]);
  expect((await wiki.get({ type: dup.type, id: dup.id }))?.id).toBe(ada.id);

  const tools = (await r.storage.get('agent', 'tools')) as {
    name: string;
    access: string;
    input: { type: string };
  }[];
  expect(Object.fromEntries(tools.map((t) => [t.name, t.access]))).toEqual({
    findPages: 'read',
    getPage: 'read',
    pagesCiting: 'read',
    createPage: 'write',
    addFact: 'write',
    updatePage: 'write',
    mergePages: 'ask',
    retractFact: 'ask',
  });
  expect(tools[0].input.type).toBe('object');
});

it('works by hand without a model, questions or an agent', async () => {
  const r = await startRepo(['store-local', 'notes', 'wiki']);
  ({ kernel } = r);
  expect(r.refused).toEqual([]);
  const wiki = use<WikiV1>(kernel, 'wiki');
  const n = await use<NotesV1>(kernel, 'notes').append({ text: 'Swim at Eriksdal' });
  await expect(wiki.revise(n.id)).rejects.toThrow(/needs a language model/);
  const p = await wiki.create('place', { name: 'Eriksdalsbadet', area: 'Södermalm' });
  expect(p).toMatchObject({ kind: 'place', area: 'Södermalm', facts: [] });
});

it('keeps both of two facts added at once, and a merged page reads as the one kept', async () => {
  const r = await startRepo(['store-local', 'notes', 'wiki']);
  ({ kernel } = r);
  const wiki = use<WikiV1>(kernel, 'wiki');
  const n = await use<NotesV1>(kernel, 'notes').append({ text: 'Ada swims on Sundays' });
  const ada = await wiki.create('person', { name: 'Ada' });
  const ref = { type: ada.type, id: ada.id };
  await Promise.all([
    wiki.addFact(ref, { text: 'Swims', sources: [n.id] }),
    wiki.addFact(ref, { text: 'On Sundays', sources: [n.id] }),
  ]);
  expect((await wiki.get(ref))?.facts.map((f) => f.text).sort()).toEqual(['On Sundays', 'Swims']);

  const lovelace = await wiki.create('person', { name: 'Ada Lovelace' });
  await wiki.merge({ type: lovelace.type, id: lovelace.id }, ref);
  expect(await wiki.get(ref)).toMatchObject({ id: lovelace.id, aliases: ['Ada'] });
  expect((await wiki.find('ada')).map((e) => e.name)).toEqual(['Ada Lovelace']);
});

it('revises a note again on the next start when its revision failed', async () => {
  // A model with no key yet: every request fails.
  const failing = FAKE_AI.replace(
    'async complete(req) {',
    "async complete(req) { throw new Error('OpenAI 401: no key');",
  );
  const before = await startRepo(['store-local', 'notes', 'wiki'], {
    'extensions/fake-ai/index.ts': failing,
  });
  await use<NotesV1>(before.kernel, 'notes').append({ text: 'Lunch with Ada at Café Lumière' });
  await settle();
  expect(await use<WikiV1>(before.kernel, 'wiki').find('Ada')).toEqual([]);
  before.kernel.dispose();

  // The key is set, and the app starts again (store-local's database is still this device's).
  const after = await startRepo(['store-local', 'notes', 'wiki'], {
    'extensions/fake-ai/index.ts': FAKE_AI,
  });
  ({ kernel } = after);
  await vi.waitFor(
    async () => expect(await use<WikiV1>(kernel!, 'wiki').find('Ada', ['person'])).toHaveLength(1),
    { timeout: 2000 },
  );
});

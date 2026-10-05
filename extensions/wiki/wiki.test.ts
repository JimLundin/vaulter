import { expect, it, vi } from 'vitest';
import { notes } from '#contracts/notes';
import { questions } from '#contracts/questions';
import { wiki } from '#contracts/wiki';
import { startRepo } from '../../src/kernel/testing.ts';

// A model that files notes the way the instructions ask, by looking at the note and the pages sent.
const FAKE_AI = `
import { defineExtension } from '#kernel';
import { chat } from '#contracts/ai.chat';
const none = { create: [], add: [], summaries: [] };
export default defineExtension({ id: 'fake-ai', version: '1.0.0', provides: { chat },
  setup() { return { chat: {
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
import { defineExtension } from '#kernel';
import { out } from '#test';
import { agentTools } from '#contracts/agent.tools';
import { z } from 'zod';
export default defineExtension({ id: 'agent', version: '1.0.0', provides: { agentTools },
  setup() { const tools = []; return { agentTools: {
    async add(t) { tools.push({ name: t.name, access: t.access, input: z.toJSONSchema(t.input) }); await out.set('agent', 'tools', tools); return () => {}; },
  } }; } });`;

const settle = () => new Promise((ok) => setTimeout(ok, 50));

it('revises pages from notes, cites every fact, asks when unsure, and gives Vaulter its tools', async () => {
  const r = await startRepo(['store-local', 'notes', 'questions', 'wiki'], {
    'extensions/fake-ai/index.ts': FAKE_AI,
    'extensions/agent/index.ts': FAKE_AGENT,
  });
  const { kernel } = r;
  expect(r.refused).toEqual([]);
  const log = kernel.use(notes);
  const pages = kernel.use(wiki);
  const asked = kernel.use(questions);

  const n1 = await log.append({ text: 'Lunch with Ada at Café Lumière' });
  // The revision runs on its own once the note is appended: wait for it to have written the page.
  await vi.waitFor(
    async () =>
      expect(await pages.find('Ada', ['person'])).toMatchObject([
        { kind: 'person', name: 'Ada', summary: 'A friend.' },
      ]),
    { timeout: 2000 },
  );
  const [ada] = await pages.find('Ada', ['person']);
  expect(ada.facts.map((f) => [f.text, f.sources])).toEqual([
    ['Had lunch at Café Lumière', [n1.id]],
  ]);
  // Found by an alias too.
  expect((await pages.find('lumière')).map((e) => e.name)).toEqual(['Café Lumière']);

  const n2 = await log.append({
    text: 'Ada said her birthday is in December; we met at the café',
  });
  await vi.waitFor(async () => expect(await asked.open()).toHaveLength(1), { timeout: 2000 });
  expect((await pages.get({ type: ada.type, id: ada.id }))?.facts.map((f) => f.text)).toEqual([
    'Had lunch at Café Lumière',
    'Birthday in December',
  ]);
  const [q] = await asked.open();
  expect(q).toMatchObject({
    from: 'wiki',
    topic: 'revise',
    title: 'Is "the café" Café Lumière?',
    notes: [n2.id],
  });
  await asked.answer(q.id, { choice: 'yes' });
  const [cafe] = await pages.find('Café Lumière', ['place']);
  expect(cafe.facts.map((f) => [f.text, f.sources])).toEqual([['Ada likes it', [n2.id]]]);
  expect((await pages.citing(n2.id)).map((e) => e.name).sort()).toEqual(['Ada', 'Café Lumière']);

  // Merging folds the facts and aliases together, and what pointed at the merged page follows.
  const dup = await pages.create('person', { name: 'Ada L.' });
  await pages.addFact(
    { type: dup.type, id: dup.id },
    { text: 'Works in Uppsala', sources: [n1.id] },
  );
  const trip = await pages.create('event', {
    name: 'Trip',
    people: [{ type: dup.type, id: dup.id }],
  });
  const merged = await pages.merge({ type: ada.type, id: ada.id }, { type: dup.type, id: dup.id });
  expect(merged.aliases).toEqual(['Ada L.']);
  expect(merged.facts.map((f) => f.text)).toEqual([
    'Had lunch at Café Lumière',
    'Birthday in December',
    'Works in Uppsala',
  ]);
  expect((await pages.get({ type: trip.type, id: trip.id }))?.people).toEqual([
    { type: ada.type, id: ada.id },
  ]);
  expect((await pages.get({ type: dup.type, id: dup.id }))?.id).toBe(ada.id);

  const tools = (await r.out.get('agent', 'tools')) as {
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
  const { kernel } = r;
  expect(r.refused).toEqual([]);
  const pages = kernel.use(wiki);
  const n = await kernel.use(notes).append({ text: 'Swim at Eriksdal' });
  await expect(pages.revise(n.id)).rejects.toThrow(/needs a language model/);
  const p = await pages.create('place', { name: 'Eriksdalsbadet', area: 'Södermalm' });
  expect(p).toMatchObject({ kind: 'place', area: 'Södermalm', facts: [] });
});

it('keeps both of two facts added at once, and a merged page reads as the one kept', async () => {
  const r = await startRepo(['store-local', 'notes', 'wiki']);
  const { kernel } = r;
  const pages = kernel.use(wiki);
  const n = await kernel.use(notes).append({ text: 'Ada swims on Sundays' });
  const ada = await pages.create('person', { name: 'Ada' });
  const ref = { type: ada.type, id: ada.id };
  await Promise.all([
    pages.addFact(ref, { text: 'Swims', sources: [n.id] }),
    pages.addFact(ref, { text: 'On Sundays', sources: [n.id] }),
  ]);
  expect((await pages.get(ref))?.facts.map((f) => f.text).sort()).toEqual(['On Sundays', 'Swims']);

  const lovelace = await pages.create('person', { name: 'Ada Lovelace' });
  await pages.merge({ type: lovelace.type, id: lovelace.id }, ref);
  expect(await pages.get(ref)).toMatchObject({ id: lovelace.id, aliases: ['Ada'] });
  expect((await pages.find('ada')).map((e) => e.name)).toEqual(['Ada Lovelace']);
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
  await before.kernel.use(notes).append({ text: 'Lunch with Ada at Café Lumière' });
  await settle();
  expect(await before.kernel.use(wiki).find('Ada')).toEqual([]);
  before.kernel.dispose();

  // The key is set, and the app starts again (store-local's database is still this device's).
  const after = await startRepo(['store-local', 'notes', 'wiki'], {
    'extensions/fake-ai/index.ts': FAKE_AI,
  });
  await vi.waitFor(
    async () => expect(await after.kernel.use(wiki).find('Ada', ['person'])).toHaveLength(1),
    { timeout: 2000 },
  );
});

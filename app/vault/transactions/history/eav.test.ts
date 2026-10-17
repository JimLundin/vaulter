import { expect, test, vi } from 'vitest';
import { e, openDatabase, clear } from '@/vault/eav/index.ts';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, seed } from '@/vault/nodes/fixtures.test-support.ts';
import { nodeHistory } from './nodes.ts';
import { vaultHistory } from './eav.ts';

const Actor = e.entity('actor', { name: e.string() });
const Note = e.entity('note', {
  title: e.string(),
  text: e.string().optional(),
  source: e.ref(Actor).optional(),
});
const schema = e.registry({ actors: Actor, notes: Note });

test('mixed history retains independent identities, historical attribution and persistence-only undo', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await using db = await openDatabase({ schema });
  const actor = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Original author' }),
  );
  const note = await db.transaction({ author: actor }, (tx) =>
    tx.entities.notes.insert({ title: 'Evidence', text: 'Before' }),
  );
  await db.transaction({ author: actor, origin: note }, async (tx) => {
    await tx.entities.notes.update({ ...note, text: 'After' });
  });
  await db.transaction(async (tx) => {
    await tx.entities.actors.update({ ...actor, name: 'Current author' });
    await tx.entities.notes.delete((await tx.entities.notes.get(note, { select: {} }))!);
  });
  const undo = vi.fn(async () => undefined);
  const history = vaultHistory({
    nodes,
    legacy: {
      entries: () => nodeHistory(nodes),
      subscribe: nodes.subscribe,
      canUndo: () => true,
      undo,
    },
    database: async () => db,
  });
  const first = await history.entries({ limit: 2 });
  await nodes.commit(request('new-content', [create('new', { kind: 'content', title: 'New' })]));
  const tail = await history.entries({ before: first.at(-1)!.key, limit: 20 });
  const all = await history.entries({ limit: 20 });
  expect(new Set(all.map((entry) => entry.key)).size).toBe(6);
  expect(tail.every((entry) => !first.some((previous) => previous.key === entry.key))).toBe(true);
  expect(all.find((entry) => entry.key === 'eav:3')).toMatchObject({
    author: 'Original author',
    origin: 'Evidence',
    details: expect.arrayContaining(['text: "Before" → "After"']),
  });
  expect(all.find((entry) => entry.key === 'eav:4')!.details).toContain('Deleted note: Evidence');
  expect(all.filter((entry) => entry.key.startsWith('eav:')).every((entry) => !entry.undo)).toBe(
    true,
  );
  expect(undo).not.toHaveBeenCalled();
  await all.find((entry) => entry.key === 'node:new-content')!.undo!();
  expect(undo).toHaveBeenCalledOnce();
  nodes.close();
});

test('reference retargets and optional clears remain visible and subscriptions stop after disposal', async () => {
  const nodes = memoryNodeBackend();
  await using db = await openDatabase({ schema });
  const [a, b] = await db.transaction(async (tx) => [
    await tx.entities.actors.insert({ name: 'Same label' }),
    await tx.entities.actors.insert({ name: 'Same label' }),
  ]);
  const note = await db.transaction((tx) =>
    tx.entities.notes.insert({ title: 'Linked evidence', text: 'Retained', source: a }),
  );
  await db.transaction((tx) => tx.entities.notes.update({ ...note, source: b, text: clear }));
  const history = vaultHistory({
    nodes,
    legacy: { entries: () => nodeHistory(nodes), subscribe: nodes.subscribe },
    database: async () => db,
  });
  const entries = await history.entries();
  expect(entries[0].details).toEqual(
    expect.arrayContaining([
      'text: "Retained" → not set',
      'source: actor: Same label → actor: Same label (reference changed)',
    ]),
  );
  const listener = vi.fn();
  const unsubscribe = history.subscribe(listener);
  await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  listener.mockClear();
  await db.transaction((tx) => tx.entities.actors.insert({ name: 'New author' }));
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  listener.mockClear();
  await db.transaction((tx) => tx.entities.actors.insert({ name: 'Later author' }));
  expect(listener).not.toHaveBeenCalled();
  const late = vi.fn();
  history.subscribe(late)();
  await Promise.resolve();
  expect(late).not.toHaveBeenCalled();
  nodes.close();
});

test('equal timestamps and overlapping journal sequences paginate without losing either store', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const nodes = memoryNodeBackend();
  try {
    await using db = await openDatabase({ schema });
    await seed(nodes);
    for (let index = 0; index < 6; index++) {
      await nodes.commit(
        request(`content-${index}`, [create(`item-${index}`, { kind: 'content' })]),
      );
      await db.transaction((tx) => tx.entities.actors.insert({ name: `Author ${index}` }));
    }
    const history = vaultHistory({
      nodes,
      legacy: { entries: () => nodeHistory(nodes), subscribe: nodes.subscribe },
      database: async () => db,
    });
    const keys: string[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await history.entries({ before, limit: 3 });
      keys.push(...page.map((entry) => entry.key));
      if (page.length < 3) break;
      before = page.at(-1)!.key;
    }
    expect(keys).toHaveLength(13);
    expect(new Set(keys).size).toBe(13);
    expect(keys).toEqual((await history.entries({ limit: 100 })).map((entry) => entry.key));
  } finally {
    nodes.close();
    vi.useRealTimers();
  }
});

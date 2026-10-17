import { expect, test, vi } from 'vitest';
import {
  e,
  openDatabase,
  clear,
  createPersistentStorage,
  SaveError,
  type Journal,
} from '@/vault/eav/index.ts';
import { vaultHistory } from './eav.ts';

const Actor = e.entity('actor', { name: e.string() });
const Note = e.entity('note', {
  title: e.string(),
  text: e.string().optional(),
  source: e.ref(Actor).optional(),
});
const schema = e.registry({ actors: Actor, notes: Note });

test('history retains historical attribution, deleted evidence and stable pagination after new commits', async () => {
  await using db = await openDatabase({ schema });
  const actor = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Original author' }),
  );
  const note = await db.transaction({ author: actor }, (tx) =>
    tx.entities.notes.insert({ title: 'Evidence', text: 'Before' }),
  );
  await db.transaction({ author: actor, origin: note }, (tx) =>
    tx.entities.notes.update({ ...note, text: 'After' }),
  );
  await db.transaction(async (tx) => {
    await tx.entities.actors.update({ ...actor, name: 'Current author' });
    await tx.entities.notes.delete((await tx.entities.notes.get(note, { select: {} }))!);
  });
  const history = vaultHistory({ database: async () => db });
  const first = await history.entries({ limit: 2 });
  await db.transaction((tx) => tx.entities.notes.insert({ title: 'New' }));
  const tail = await history.entries({ before: first.at(-1)!.key, limit: 20 });
  const all = await history.entries({ limit: 20 });
  expect(new Set(all.map((entry) => entry.key)).size).toBe(5);
  expect(tail.map((entry) => entry.key)).toEqual(['eav:2', 'eav:1']);
  expect(all.find((entry) => entry.key === 'eav:3')).toMatchObject({
    author: 'Original author',
    origin: 'Evidence',
    details: expect.arrayContaining(['text: "Before" → "After"']),
  });
  expect(all.find((entry) => entry.key === 'eav:4')!.details).toContain('Deleted note: Evidence');
  expect(all.every((entry) => !entry.undo)).toBe(true);
  await expect(history.entries({ before: 'eav:unknown' })).rejects.toThrow(
    'History cursor is unavailable',
  );
});

test('reference retargets and optional clears remain visible and subscriptions stop after disposal', async () => {
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
});

test('equal timestamps paginate in journal order without losing transactions', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    await using db = await openDatabase({ schema });
    for (let index = 0; index < 9; index++) {
      await db.transaction((tx) => tx.entities.actors.insert({ name: `Author ${index}` }));
    }
    const history = vaultHistory({ database: async () => db });
    const keys: string[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await history.entries({ before, limit: 3 });
      keys.push(...page.map((entry) => entry.key));
      if (page.length < 3) break;
      before = page.at(-1)!.key;
    }
    expect(keys).toEqual(Array.from({ length: 9 }, (_, index) => `eav:${9 - index}`));
    expect(keys).toEqual((await history.entries({ limit: 100 })).map((entry) => entry.key));
  } finally {
    vi.useRealTimers();
  }
});

test('owner-authorized compensation restores updates atomically and rejects changed records', async () => {
  await using db = await openDatabase({ schema });
  const actor = await db.transaction((tx) => tx.entities.actors.insert({ name: 'User' }));
  const [first, second] = await db.transaction(async (tx) => [
    await tx.entities.notes.insert({ title: 'First', text: 'Before' }),
    await tx.entities.notes.insert({ title: 'Second' }),
  ]);
  await db.transaction(async (tx) => {
    await tx.entities.notes.update({ ...first, text: 'After', source: actor });
    await tx.entities.notes.update({ ...second, title: 'Renamed' });
  });
  const history = vaultHistory({
    database: async () => db,
    compensation: { types: ['notes'], author: async () => actor },
  });
  const entry = (await history.entries())[0];
  expect(entry.undo).toBeDefined();
  await entry.undo!();
  expect(await db.entities.notes.get(first, { select: { text: true, source: true } })).toEqual(
    expect.objectContaining({ text: 'Before' }),
  );
  expect(
    (await db.entities.notes.get(first, { select: { source: true } }))!.source,
  ).toBeUndefined();
  expect((await db.entities.notes.get(second, { select: { title: true } }))!.title).toBe('Second');
  await expect(entry.undo!()).rejects.toThrow('newer history');
  const entries = await history.entries();
  expect(entries.find((item) => item.key === 'eav:1')!.undo).toBeUndefined();
  expect(entries.find((item) => item.key === 'eav:2')!.undo).toBeUndefined();
  expect(entries[0].author).toBe('User');
});

test('one stale record prevents restoring any other record and admission is checked before writes', async () => {
  await using db = await openDatabase({ schema });
  const actor = await db.transaction((tx) => tx.entities.actors.insert({ name: 'User' }));
  const [first, second] = await db.transaction(async (tx) => [
    await tx.entities.notes.insert({ title: 'First' }),
    await tx.entities.notes.insert({ title: 'Second' }),
  ]);
  await db.transaction(async (tx) => {
    await tx.entities.notes.update({ ...first, title: 'Changed first' });
    await tx.entities.notes.update({ ...second, title: 'Changed second' });
  });
  let writable = true;
  const history = vaultHistory({
    database: async () => db,
    compensation: {
      types: ['notes'],
      author: async () => actor,
      admission: () => {
        if (!writable) throw new Error('Locked');
      },
    },
  });
  const entry = (await history.entries())[0];
  await db.transaction(async (tx) =>
    tx.entities.notes.update({
      ...(await tx.entities.notes.get(second, { select: {} }))!,
      title: 'Later',
    }),
  );
  await expect(entry.undo!()).rejects.toThrow('newer history');
  expect((await db.entities.notes.get(first, { select: { title: true } }))!.title).toBe(
    'Changed first',
  );
  writable = false;
  await expect(entry.undo!()).rejects.toThrow('Locked');
});

test('uncertain compensation retries the exact publication without recalculating or repeating changes', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  let fail = false;
  const attempts: string[] = [];
  const storage = createPersistentStorage({
    scope: 'history-test',
    load: async () => journal,
    append: async (request) => {
      attempts.push(JSON.stringify(request));
      if (fail) throw new Error('Offline');
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
    },
  });
  await using db = await openDatabase({ schema, storage });
  const actor = await db.transaction((tx) => tx.entities.actors.insert({ name: 'User' }));
  const note = await db.transaction((tx) => tx.entities.notes.insert({ title: 'Before' }));
  await db.transaction((tx) => tx.entities.notes.update({ ...note, title: 'After' }));
  const author = vi.fn(async () => actor);
  const history = vaultHistory({
    database: async () => db,
    compensation: { types: ['notes'], author },
  });
  const entry = (await history.entries())[0];
  fail = true;
  await expect(entry.undo!()).rejects.toBeInstanceOf(SaveError);
  fail = false;
  await entry.undo!();
  expect(attempts.at(-1)).toBe(attempts.at(-2));
  expect(author).toHaveBeenCalledOnce();
  expect((await db.entities.notes.get(note, { select: { title: true } }))!.title).toBe('Before');
  expect(await db.history.transactions.query({ select: {} })).toHaveLength(4);
});

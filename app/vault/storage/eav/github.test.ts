import 'fake-indexeddb/auto';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { Dexie } from 'dexie';
import {
  e,
  openDatabase,
  createPersistentStorage,
  closeStorage,
  SaveError,
  ConflictError,
  type MemoryStorage,
  type Transaction,
} from '../../eav/index.ts';
import { githubEavAdapter } from './github.ts';
import { fakeGitHub } from '../github-client/fake-github.ts';
import { serial } from '../../../runtime/async.ts';

const schema = e.registry({
  messages: e.entity('message', { text: e.string(), details: e.json() }),
});
const stores: MemoryStorage[] = [];
beforeEach(() => {
  const queue = serial();
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, work: () => Promise<unknown>) => queue(work) },
  });
});
afterEach(async () => {
  for (const store of stores.splice(0)) closeStorage(store);
  for (const name of await Dexie.getDatabaseNames())
    if (name.startsWith('vaulter-eav-')) await Dexie.delete(name);
  vi.unstubAllGlobals();
});

async function setup() {
  const fake = await fakeGitHub({
    'Existing.md': 'Retained',
    '.vaulter/nodes/unrelated': 'Node data',
  });
  const open = async (fetchFn = fake.fetchFn) => {
    const storage = createPersistentStorage(
      githubEavAdapter({
        token: 'fictional',
        repo: { owner: 'test', name: 'eav', branch: 'main' },
        api: 'https://gh.test',
        fetch: fetchFn,
      }),
    );
    stores.push(storage);
    return openDatabase({ schema, storage });
  };
  return { ...fake, open };
}

test('durable EAV acceptance survives a fresh backend and preserves unrelated files', async () => {
  const { open, filesAt } = await setup();
  await using db = await open();
  await db.transaction((tx) =>
    tx.entities.messages.insert({ text: 'Retained', details: { array: ['a', 'b', 'a'] } }),
  );
  await using reopened = await open();
  expect(
    await reopened.entities.messages.first({ select: { text: true, details: true } }),
  ).toMatchObject({ text: 'Retained', details: { array: ['a', 'b', 'a'] } });
  expect(await reopened.schema.revisions()).toHaveLength(1);
  expect(filesAt()['Existing.md']).toBe('Retained');
  expect(filesAt()['.vaulter/nodes/unrelated']).toBe('Node data');
});

test('lost remote acceptance retries exactly one publication without repeating calculation', async () => {
  const { open, fetchFn, filesAt } = await setup();
  let broken = false;
  let dropped = false;
  const transport: typeof fetch = async (url, init) => {
    if (broken) throw new TypeError('Offline');
    const response = await fetchFn(url, init);
    if (!dropped && init?.method === 'PATCH') {
      dropped = true;
      broken = true;
      throw new TypeError('Lost response');
    }
    return response;
  };
  await using db = await open(transport);
  const calculation = vi.fn(async (tx: Transaction<typeof schema>) =>
    tx.entities.messages.insert({ text: 'Once', details: null }),
  );
  let failure: unknown;
  try {
    await db.transaction(calculation);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(SaveError);
  expect(await db.entities.messages.first({ select: {} })).toBeUndefined();
  broken = false;
  if (!(failure instanceof SaveError)) throw new Error('Expected pending save');
  await failure.retry();
  await failure.retry();
  expect(calculation).toHaveBeenCalledOnce();
  expect(await db.entities.messages.query({ select: {} })).toHaveLength(1);
  expect(Object.keys(filesAt()).filter((path) => path.startsWith('.vaulter/eav/'))).toHaveLength(1);
});

test('cached EAV history remains readable offline and writes require remote acceptance', async () => {
  const { open } = await setup();
  await using db = await open();
  await db.transaction((tx) => tx.entities.messages.insert({ text: 'Cached', details: null }));
  await using offline = await open(async () => {
    throw new TypeError('Offline');
  });
  expect(await offline.entities.messages.first({ select: { text: true } })).toMatchObject({
    text: 'Cached',
  });
  await expect(
    offline.transaction((tx) => tx.entities.messages.insert({ text: 'Unsaved', details: null })),
  ).rejects.toBeInstanceOf(SaveError);
  expect(await offline.entities.messages.query({ select: {} })).toHaveLength(1);
});

test('concurrent handles reject stale writes and can explicitly retry against accepted history', async () => {
  const { open } = await setup();
  await using first = await open();
  await using second = await open();
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stale = first.transaction(async (tx) => {
    const message = await tx.entities.messages.insert({ text: 'Second', details: null });
    entered();
    await gate;
    return message;
  });
  await ready;
  await second.transaction((tx) => tx.entities.messages.insert({ text: 'First', details: null }));
  const rejected = expect(stale).rejects.toBeInstanceOf(ConflictError);
  release();
  await rejected;
  await first.transaction((tx) => tx.entities.messages.insert({ text: 'Second', details: null }));
  await using reopened = await open();
  expect(await reopened.entities.messages.query({ select: { text: true } })).toMatchObject([
    { text: 'First' },
    { text: 'Second' },
  ]);
});

test('rewritten remote history is rejected without falling back to a cached view', async () => {
  const { open, filesAt, push } = await setup();
  await using db = await open();
  await db.transaction((tx) => tx.entities.messages.insert({ text: 'Original', details: null }));
  const path = Object.keys(filesAt()).find((value) => value.startsWith('.vaulter/eav/'))!;
  await push({ [path]: filesAt()[path]!.replace('Original', 'Rewritten') });
  await expect(db.refresh()).rejects.toThrow('removed or rewritten');
  expect(await db.entities.messages.first({ select: { text: true } })).toMatchObject({
    text: 'Original',
  });
});

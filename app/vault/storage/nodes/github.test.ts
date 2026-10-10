import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Dexie } from 'dexie';
import { githubNodeBackend, NODE_NAMESPACE } from './github.ts';
import { fakeGitHub } from '../github-client/fake-github.ts';
import { newCacheKey } from '../../session/crypto.ts';
import { serial } from '../coordination.ts';
import { seed, request, create, revise } from '../../nodes/fixtures.test-support.ts';
import type { NodeBackend } from '../../nodes/store.ts';
import { undoNodes } from '../../nodes/operations-runtime.ts';

let stores: NodeBackend[] = [];
beforeEach(() => {
  const locks = new Map<string, ReturnType<typeof serial>>();
  vi.stubGlobal('navigator', {
    onLine: true,
    locks: {
      request: (name: string, work: () => Promise<unknown>) => {
        if (!locks.has(name)) locks.set(name, serial());
        return locks.get(name)!(work);
      },
    },
  });
  vi.stubGlobal('BroadcastChannel', undefined);
});
afterEach(async () => {
  for (const store of stores) store.close();
  stores = [];
  for (const name of await Dexie.getDatabaseNames()) {
    // biome-ignore lint/performance/noAwaitInLoops: isolated test databases are removed before the next test.
    if (name.startsWith('vaulter-nodes-')) await Dexie.delete(name);
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup() {
  const fake = await fakeGitHub({ 'Existing.md': '# Untouched legacy file' });
  const key = await newCacheKey();
  const open = (fetchFn = fake.fetchFn, otherKey = key) => {
    const store = githubNodeBackend({
      token: 'test',
      key: otherKey,
      repo: { owner: 'fictional', name: 'vault', branch: 'main' },
      api: 'https://gh.test',
      fetch: fetchFn,
    });
    stores.push(store);
    return store;
  };
  const store = open();
  await store.refresh();
  await seed(store);
  return { ...fake, store, open, key };
}

test('node JSON and transaction metadata retain all keys through cache reopen and remote rebuild', async () => {
  const { store, open } = await setup();
  const data = JSON.parse('{"__proto__":{"text":"retain"},"constructor":2,"prototype":3}');
  await store.commit({ ...request('json', [create('json', data)]), metadata: data });
  store.close();
  const cached = open();
  await cached.cached();
  expect((await cached.snapshot()).get('json')?.data).toEqual(data);
  expect(
    (await cached.history()).find((transaction) => transaction.id === 'json')?.metadata,
  ).toEqual(data);
  cached.close();
  const remote = open(undefined, await newCacheKey());
  await remote.refresh();
  expect((await remote.snapshot()).get('json')?.data).toEqual(data);
  expect(
    (await remote.history()).find((transaction) => transaction.id === 'json')?.metadata,
  ).toEqual(data);
});

test('one envelope is remotely accepted, legacy files preserved, exact citations survive cache reopen and remote rebuild', async () => {
  const { store, open, state, filesAt } = await setup();
  const before = state.main;
  const done = await store.commit(
    request('citation', [
      create('claim', { text: 'Protect mornings.' }, 'page'),
      {
        ...create('citation', { range: { start: 0, end: 4 } }, 'claim'),
        connection: {
          source: { node: 'claim', transaction: 'citation' },
          target: { node: 'evidence', transaction: 'seed' },
        },
      },
    ]),
  );
  expect(state.main).not.toBe(before);
  expect(filesAt()['Existing.md']).toBe('# Untouched legacy file');
  expect(Object.keys(filesAt()).filter((path) => path.startsWith(NODE_NAMESPACE))).toHaveLength(2);
  expect(JSON.parse(filesAt()[`${NODE_NAMESPACE}citation.json`]).versions).toHaveLength(2);
  await store.commit(request('delete', [await revise(store, 'evidence', null)]));
  store.close();
  const cached = open();
  await cached.cached();
  expect((await cached.snapshot()).sequence).toBe(3);
  const citation = (await cached.snapshot()).get('citation')!;
  expect((await cached.snapshot()).resolve(citation.connection!.target)?.data?.text).toBe(
    'Keep mornings free.',
  );
  await undoNodes(cached, done.id, 'user');
  const newDevice = open(undefined, await newCacheKey());
  await newDevice.refresh();
  expect((await newDevice.snapshot()).resolve(citation.key)).toEqual(citation);
  expect((await newDevice.snapshot()).get('citation')?.data).toBeNull();
});

test('cache encrypts structural data and metadata with an injected key and no persisted CryptoKey', async () => {
  const { store } = await setup();
  await store.commit({
    ...request('meta', [await revise(store, 'evidence', { text: 'Private sample sentence' })]),
    metadata: { detail: 'Private sample attribution' },
  });
  const name = (await Dexie.getDatabaseNames()).find((value) =>
    value.startsWith('vaulter-nodes-'),
  )!;
  const db = new Dexie(name);
  await db.open();
  const rows = await Promise.all(db.tables.map(async (table) => table.toArray()));
  expect(JSON.stringify(rows)).not.toContain('Private sample');
  expect(JSON.stringify(rows)).not.toContain('placement');
  expect(db.tables.map((table) => table.name)).toEqual(['envelopes', 'head', 'owner']);
  expect(rows.flat().some((row) => 'key' in row)).toBe(false);
  db.close();
});

test('remote races revalidate: unrelated nodes accept unique sequences, same node conflicts', async () => {
  const { store, open, state } = await setup();
  // Separate devices do not share a browser lock manager. Each adapter still has its own queue.
  vi.stubGlobal('navigator', {
    onLine: true,
    locks: { request: (_name: string, work: () => Promise<unknown>) => work() },
  });
  const other = open();
  await other.refresh();
  const a = request('a', [await revise(store, 'page', { title: 'A' })]);
  const b = request('b', [await revise(other, 'evidence', { text: 'B' })]);
  const accepted = await Promise.all([store.commit(a), other.commit(b)]);
  expect(accepted.map((record) => record.sequence).sort()).toEqual([2, 3]);
  const one = await revise(store, 'user', { name: 'One' });
  const two = { ...one, data: { name: 'Two' } };
  const result = await Promise.allSettled([
    store.commit(request('one', [one])),
    other.commit(request('two', [two])),
  ]);
  expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  await store.refresh();
  expect((await store.snapshot()).sequence).toBe(4);
  expect(state.calls.filter((call) => call.startsWith('PATCH')).length).toBeGreaterThan(4);
});

test('lost ref-update response is reconciled, identical retry adds nothing and changed retry fails', async () => {
  const { open, fetchFn, state } = await setup();
  let lost = false;
  const flaky = (async (url, init) => {
    const response = await fetchFn(url, init);
    if (init?.method === 'PATCH' && response.ok && !lost) {
      lost = true;
      throw new TypeError('Lost response');
    }
    return response;
  }) as typeof fetch;
  const store = open(flaky);
  await store.refresh();
  const input = request('once', [await revise(store, 'evidence', { text: 'Once' })]);
  const done = await store.commit(input);
  const after = state.main;
  expect(await store.commit(input)).toEqual(done);
  expect(state.main).toBe(after);
  await expect(store.commit({ ...input, message: 'different' })).rejects.toThrow('reused');
});

test('offline cached reads work; unsaved commits never advance local or remote history', async () => {
  const { store, open, state } = await setup();
  const input = request('offline', [await revise(store, 'evidence', { text: 'Must not save' })]);
  store.close();
  const before = state.main;
  const offline = open(() => Promise.reject(new TypeError('Network unavailable')));
  await offline.cached();
  expect((await offline.snapshot()).sequence).toBe(1);
  await expect(offline.commit(input)).rejects.toThrow('Network unavailable');
  expect((await offline.snapshot()).sequence).toBe(1);
  expect(state.main).toBe(before);
  await expect(offline.refresh()).rejects.toThrow();
});

test('external edits or removal of accepted envelopes reject without replacing visible history', async () => {
  const { store, push, filesAt } = await setup();
  const path = `${NODE_NAMESPACE}seed.json`;
  const changed = JSON.parse(filesAt()[path]);
  changed.versions[0].data.name = 'Tampered';
  await push({ [path]: JSON.stringify(changed) });
  await expect(store.refresh()).rejects.toThrow('rewritten');
  expect((await store.snapshot()).get('user')?.data?.name).toBe('Fictional user');
  await push({ [path]: null });
  await expect(store.refresh()).rejects.toThrow('removed');
});

test('invalid exact pair and stale declared read reject the complete remote transaction before a ref update', async () => {
  const { store, state } = await setup();
  await store.commit(request('newer', [await revise(store, 'evidence', { text: 'New' })]));
  const before = state.main;
  await expect(
    store.commit(
      request('bad', [
        await revise(store, 'page', { title: 'Must not publish' }),
        {
          ...create('ref', {}),
          connection: { source: { node: 'page' }, target: { node: 'user', transaction: 'newer' } },
        },
      ]),
    ),
  ).rejects.toThrow('exact version');
  await expect(
    store.commit({
      ...request('read', [await revise(store, 'page', {})]),
      expectedReads: { evidence: 'seed' },
    }),
  ).rejects.toThrow('Conflict');
  expect(state.main).toBe(before);
  expect((await store.snapshot()).sequence).toBe(2);
});

test('clear removes device records and a new open rebuilds remote history; missing Web Locks refuses writes', async () => {
  const { store, open, state } = await setup();
  const before = state.main;
  await store.clear();
  expect((await store.snapshot()).sequence).toBe(0);
  store.close();
  const other = open();
  await other.cached();
  expect((await other.snapshot()).sequence).toBe(0);
  await other.refresh();
  expect((await other.snapshot()).sequence).toBe(1);
  vi.stubGlobal('navigator', {});
  await expect(other.commit(request('unsafe', [create('new', {})]))).rejects.toThrow('coordinate');
  expect(state.main).toBe(before);
});

test('an incomplete device cache is discarded and rebuilt even if the remote head has not moved', async () => {
  const { store, open } = await setup();
  await store.commit(request('latest', [await revise(store, 'evidence', { text: 'Latest' })]));
  store.close();
  const name = (await Dexie.getDatabaseNames()).find((value) =>
    value.startsWith('vaulter-nodes-'),
  )!;
  const db = new Dexie(name);
  await db.open();
  await db.table('envelopes').delete('latest');
  db.close();
  const next = open();
  await next.cached();
  expect((await next.snapshot()).sequence).toBe(0);
  await next.refresh();
  expect((await next.snapshot()).sequence).toBe(2);
  expect((await next.snapshot()).get('evidence')?.data?.text).toBe('Latest');
});

test('a failed cache transaction after remote acceptance cannot make the commit appear rejected', async () => {
  const { store, open, state } = await setup();
  const add = vi
    .spyOn(Dexie.prototype, 'transaction')
    .mockRejectedValueOnce(new Error('Device storage full'));
  const done = await store.commit(
    request('cache-failure', [await revise(store, 'evidence', { text: 'Accepted remotely' })]),
  );
  add.mockRestore();
  expect(done.sequence).toBe(2);
  expect((await store.snapshot()).get('evidence')?.data?.text).toBe('Accepted remotely');
  const accepted = state.main;
  const next = open();
  await next.refresh();
  expect((await next.snapshot()).sequence).toBe(2);
  expect(state.main).toBe(accepted);
});

test('refresh fetches only new envelopes and repeats no tree/blob read when the remote head is unchanged', async () => {
  const { store, state, push } = await setup();
  state.calls.length = 0;
  await store.refresh();
  await store.refresh();
  expect(
    state.calls.filter((call) => call.includes('/git/trees/') || call.includes('/git/blobs/')),
  ).toEqual([]);
  await push({ 'Elsewhere.md': '# Other writer' });
  state.calls.length = 0;
  await store.refresh();
  expect(state.calls.filter((call) => call.includes('/git/blobs/'))).toEqual([]);
});

test('closing while waiting for another tab releases the pending write without publishing', async () => {
  const { store, state } = await setup();
  const before = state.main;
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const release = new Promise<void>((resolve) => {
    resume = resolve;
  });
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, work: () => Promise<unknown>) => {
        enter();
        await release;
        return work();
      },
    },
  });
  const pending = store.commit(
    request('queued', [await revise(store, 'evidence', { text: 'Must not publish' })]),
  );
  const rejected = expect(pending).rejects.toThrow('closed');
  await entered;
  store.close();
  resume();
  await rejected;
  expect(state.main).toBe(before);
});

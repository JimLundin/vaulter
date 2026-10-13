import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakeGitHub } from '../github-client/fake-github.ts';
import { clear, db } from './cache.ts';
import { githubBackend } from './index.ts';
import { writerCore, type Overlay } from '../../changes/writer.ts';
import type { FileRules } from '../../files.ts';
import { serial } from '../coordination.ts';

beforeEach(() => {
  // One lock manager shared by the two adapters, like an origin's Web Locks manager.
  const locks = new Map<string, ReturnType<typeof serial>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        name: string,
        options: { signal?: AbortSignal } | (() => Promise<unknown>),
        callback?: () => Promise<unknown>,
      ) => {
        if (!locks.has(name)) locks.set(name, serial());
        const run = locks.get(name)!;
        return typeof options === 'function' ? run(options) : run(callback!, options.signal);
      },
    },
  });
});
afterEach(async () => {
  await clear();
  await db.close();
  vi.unstubAllGlobals();
});
const rules: FileRules = { keeps: () => true, what: 'test files', problems: async () => [] };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function setup() {
  const fake = await fakeGitHub({ 'Alpha.md': '# Alpha' });
  const open = () => githubBackend({ token: 'test', api: 'https://gh.test', fetch: fake.fetchFn });
  const first = open();
  let firstHead = (await first.refresh())!;
  const second = open();
  let secondHead = (await second.cached())!;
  const a = writerCore(
    first,
    rules,
    () => firstHead.files,
    (head) => {
      firstHead = head;
    },
  );
  const b = writerCore(
    second,
    rules,
    () => secondHead.files,
    (head) => {
      secondHead = head;
    },
  );
  return { fake, first, second, a, b };
}

test('separate GitHub adapters merge staging from device storage under shared ownership', async () => {
  const { first, a, b } = await setup();
  await Promise.all([a.load(), b.load()]);
  await Promise.all([a.stage('First.md', '# First'), b.stage('Second.md', '# Second')]);
  expect(Object.keys((await first.keep.get<Overlay>('overlay'))!.files)).toEqual([
    'First.md',
    'Second.md',
  ]);
});

test('a waiting GitHub writer calculates from the preceding owner’s committed snapshot', async () => {
  const { a, b, fake } = await setup();
  const entered = deferred();
  const release = deferred();
  const sequence = a.write(
    async (vault) => {
      await vault.stage('Alpha.md', '# First');
      entered.resolve();
      await release.promise;
      await vault.commit!('first');
    },
    { staged: 'reject' },
  );
  await entered.promise;
  let calculated = false;
  const waiting = b.update((files) => {
    calculated = true;
    return [{ path: 'Alpha.md', text: `${files[0].text}\nSecond` }];
  });
  await Promise.resolve();
  expect(calculated).toBe(false);
  release.resolve();
  await Promise.all([sequence, waiting]);
  expect(b.overlay?.files['Alpha.md']).toBe('# First\nSecond');
  await b.commit!('second');
  const latest = (await fake.gh.ref())!;
  const tree = await fake.gh.tree(latest.commit);
  expect(new TextDecoder().decode(await fake.gh.blob(tree.entries[0].sha))).toBe('# First\nSecond');
});

test('refresh adopts another adapter’s commit before conditional sync and cannot restore an old cache', async () => {
  const { a, second } = await setup();
  await a.stage('Alpha.md', '# Committed');
  await a.commit!('change');
  const head = await second.refresh();
  expect(head?.files[0].text).toBe('# Committed');
  expect((await second.cached())?.files[0].text).toBe('# Committed');
  expect(await second.refresh()).toBeNull();
});

test('staging refuses to mutate storage when Web Locks are unavailable', async () => {
  const { first, a } = await setup();
  vi.stubGlobal('navigator', {});
  await expect(a.stage('Alpha.md', '# Unsafe')).rejects.toThrow('cannot coordinate');
  expect(await first.keep.get('overlay')).toBeNull();
});

test('closed adapters reject queued owners and cannot restore files or staging after clear', async () => {
  const { fake, first, second, b } = await setup();
  const entered = deferred();
  const release = deferred();
  const owner = first.coordinate(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const staging = b.stage('Alpha.md', '# Late staging');
  const rejected = expect(staging).rejects.toThrow('backend is closed');
  second.close!();
  release.resolve();
  await Promise.all([owner, rejected]);
  await second.clear!();
  const requests = fake.state.calls.length;
  await expect(second.refresh()).rejects.toThrow('backend is closed');
  await expect(second.cached()).rejects.toThrow('backend is closed');
  await expect(
    second.write!([{ path: 'Alpha.md', text: '# Late write' }], 'late', async () => undefined),
  ).rejects.toThrow('backend is closed');
  await expect(
    second.keep.set('overlay', { files: { 'Alpha.md': '# Late staging' } }),
  ).rejects.toThrow('backend is closed');
  expect(fake.state.calls).toHaveLength(requests);
  expect(await first.cached()).toBeNull();
  expect(await first.keep.get('overlay')).toBeNull();
  expect(fake.filesAt()['Alpha.md']).toBe('# Alpha');
  first.close!();
});

test('closing while GitHub accepts a write preserves its result and clear waits for its cache update', async () => {
  const fake = await fakeGitHub({ 'Alpha.md': '# Alpha' });
  const accepted = deferred();
  const release = deferred();
  const backend = githubBackend({
    token: 'test',
    api: 'https://gh.test',
    fetch: async (url, init) => {
      const response = await fake.fetchFn(url, init);
      if (init?.method === 'PATCH') {
        accepted.resolve();
        await release.promise;
      }
      return response;
    },
  });
  await backend.refresh();
  const writing = backend.write!(
    [{ path: 'Alpha.md', text: '# Accepted' }],
    'accepted before closing',
    async () => undefined,
  );
  await accepted.promise;
  backend.close!();
  const clearing = backend.clear!();
  release.resolve();
  const written = await writing;
  await clearing;
  expect(written.commit).toBe(fake.state.main);
  expect(written.head.files[0].text).toBe('# Accepted');
  expect(fake.filesAt()['Alpha.md']).toBe('# Accepted');
  expect(await db.getAll('snapshot')).toEqual([]);
  expect(await db.getAll('blobs')).toEqual([]);
  expect(await db.getAll('keep')).toEqual([]);
});

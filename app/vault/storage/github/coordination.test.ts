import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { newCacheKey } from '../../session/crypto.ts';
import { fakeGitHub } from '../github-client/fake-github.ts';
import { clear, db } from './cache.ts';
import { githubBackend } from './index.ts';
import { writerCore, type Overlay } from '../../changes/writer.ts';
import type { FileRules } from '../../files.ts';
import { serial } from '../coordination.ts';

let key: CryptoKey;
beforeEach(async () => {
  key = await newCacheKey();
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
  const open = () =>
    githubBackend({ token: 'test', key, api: 'https://gh.test', fetch: fake.fetchFn });
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

test('separate GitHub adapters merge staging from encrypted storage under shared ownership', async () => {
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

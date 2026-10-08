import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { fakeGitHub } from './fake-github.ts';
import { closeDb, getAll, newCacheKey } from '../../core/store.ts';
import { forget } from '../../core/unlock.ts';
import { readCache, sync } from './sync.ts';
import { githubBackend } from './index.ts';
import { isVaultPath } from '../../extensions/notes/model/note.ts';

let key: CryptoKey;
beforeEach(async () => {
  key = await newCacheKey();
});
afterEach(async () => {
  await forget();
  await closeDb();
});

test('first sync fetches only the files the app keeps; the cache then reads back', async () => {
  const f = await fakeGitHub({
    'Ada.md': '# Ada',
    'daily/2026-10-03.md': '# 2026-10-03',
    'site/x.ts': 'code',
    'README.md': 'r',
  });
  const backend = githubBackend({
    token: 'tok',
    key,
    api: 'https://gh.test',
    fetch: f.fetchFn,
    keeps: isVaultPath,
  });
  const h = await backend.refresh();
  expect(h!.files.map((x) => x.path).sort()).toEqual(['Ada.md', 'daily/2026-10-03.md']);
  expect(f.state.calls.filter((c) => c.startsWith('GET /git/blobs/'))).toHaveLength(2);
  expect((await readCache(key))!.files.find((f) => f.path === 'Ada.md')!.text).toBe('# Ada');
});

test('an unchanged main is a single 304', async () => {
  const { gh, state } = await fakeGitHub({ 'Ada.md': '# Ada' });
  const first = await sync(key, gh, null);
  state.calls = [];
  expect(await sync(key, gh, first!.snapshot)).toBeNull();
  expect(state.calls).toEqual(['GET /git/ref/heads/main']);
});

test('a change fetches only the changed blob, and old blobs are collected', async () => {
  const { gh, state, push } = await fakeGitHub({ 'Ada.md': '# Ada', 'Work.mdx': '# Work' });
  const first = await sync(key, gh, null);
  await push({ 'Ada.md': '# Ada, updated' });
  state.calls = [];
  const r = await sync(key, gh, first!.snapshot);
  expect(state.calls.filter((c) => c.startsWith('GET /git/blobs/'))).toHaveLength(1);
  expect(r!.files.find((f) => f.path === 'Ada.md')!.text).toBe('# Ada, updated');
  expect(await getAll('blobs')).toHaveLength(2);
});

test('a blob that does not match its hash is refused', async () => {
  const { gh, state } = await fakeGitHub({ 'Ada.md': '# Ada' });
  state.tamper = '# Not Ada';
  await expect(sync(key, gh, null)).rejects.toThrow(/does not match/);
  expect(await readCache(key)).toBeNull();
});

test('nothing in the store is readable without the key', async () => {
  const { gh } = await fakeGitHub({ 'Private Diagnosis.mdx': 'the diagnosis itself' });
  await sync(key, gh, null);
  const dump = JSON.stringify(await getAll('snapshot')) + JSON.stringify(await getAll('blobs'));
  expect(dump).not.toContain('Diagnosis');
  expect(dump).not.toContain('diagnosis itself');
  expect(await readCache(await newCacheKey())).toBeNull();
});

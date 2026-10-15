import 'fake-indexeddb/auto';
import { afterEach, expect, test } from 'vitest';
import { fakeGitHub } from '../../github-client/fake-github.ts';
import { clear, db } from './cache.ts';
import { readCache, sync } from './sync.ts';
import { githubBackend } from './index.ts';
import { database } from '../../../session/idb.ts';
import { isVaultPath } from '../../../documents/notes/note.ts';

afterEach(async () => {
  await clear();
  await db.close();
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
    api: 'https://gh.test',
    fetch: f.fetchFn,
    keeps: isVaultPath,
  });
  const h = await backend.refresh();
  expect(h!.files.map((x) => x.path).sort()).toEqual(['Ada.md', 'daily/2026-10-03.md']);
  expect(f.state.calls.filter((c) => c.startsWith('GET /git/blobs/'))).toHaveLength(2);
  expect((await readCache())!.files.find((file) => file.path === 'Ada.md')!.text).toBe('# Ada');
});

test('an unchanged main is a single 304', async () => {
  const { gh, state } = await fakeGitHub({ 'Ada.md': '# Ada' });
  const first = await sync(gh, null);
  state.calls = [];
  expect(await sync(gh, first!.snapshot)).toBeNull();
  expect(state.calls).toEqual(['GET /git/ref/heads/main']);
});

test('a change fetches only the changed blob, and old blobs are collected', async () => {
  const { gh, state, push } = await fakeGitHub({ 'Ada.md': '# Ada', 'Work.mdx': '# Work' });
  const first = await sync(gh, null);
  await push({ 'Ada.md': '# Ada, updated' });
  state.calls = [];
  const r = await sync(gh, first!.snapshot);
  expect(state.calls.filter((c) => c.startsWith('GET /git/blobs/'))).toHaveLength(1);
  expect(r!.files.find((file) => file.path === 'Ada.md')!.text).toBe('# Ada, updated');
  expect(await db.getAll('blobs')).toHaveLength(2);
});

test('a blob that does not match its hash is refused', async () => {
  const { gh, state } = await fakeGitHub({ 'Ada.md': '# Ada' });
  state.tamper = '# Not Ada';
  await expect(sync(gh, null)).rejects.toThrow(/does not match/);
  expect(await readCache()).toBeNull();
});

test('vault contents are stored as plaintext', async () => {
  const { gh } = await fakeGitHub({ 'Private Diagnosis.mdx': 'the diagnosis itself' });
  await sync(gh, null);
  const dump =
    JSON.stringify(await db.getAll('snapshot')) + JSON.stringify(await db.getAll('blobs'));
  expect(dump).toContain('Diagnosis');
  expect(dump).toContain('diagnosis itself');
  expect((await readCache())!.files[0].text).toBe('the diagnosis itself');
});

test('a plaintext cache is retained when the backend reopens', async () => {
  const f = await fakeGitHub({ 'Ada.md': '# Ada' });
  const open = () => githubBackend({ token: 'tok', api: 'https://gh.test', fetch: f.fetchFn });
  await open().refresh();
  const b = open();
  expect((await b.cached())!.files.map((x) => x.text)).toEqual(['# Ada']);
});

test('sign out clears plaintext files and staged application state', async () => {
  const f = await fakeGitHub({ 'Ada.md': '# Ada' });
  const backend = githubBackend({ token: 'tok', api: 'https://gh.test', fetch: f.fetchFn });
  await backend.refresh();
  const staged = { files: { 'Ada.md': '# Unsaved change' }, from: {}, version: 1 };
  await backend.keep.set('overlay', staged);
  expect(await db.getAll('keep')).toEqual([{ id: 'overlay', value: staged }]);
  await db.close();
  expect(await backend.keep.get('overlay')).toEqual(staged);
  expect((await backend.cached())!.files[0].text).toBe('# Ada');
  await backend.clear!();
  expect(await backend.cached()).toBeNull();
  expect(await backend.keep.get('overlay')).toBeNull();
  expect(await db.getAll('blobs')).toEqual([]);
  expect(f.filesAt()['Ada.md']).toBe('# Ada');
});

test('the plaintext format resets old file caches and removes the ownership store', async () => {
  await db.close();
  await new Promise<void>((resolve, reject) => {
    const removal = indexedDB.deleteDatabase('vault-github');
    removal.onsuccess = () => resolve();
    removal.onerror = () => reject(removal.error);
  });
  const old = database('vault-github', 1, {
    blobs: 'sha',
    snapshot: 'id',
    keep: 'id',
    owner: 'id',
  });
  await old.put('blobs', { sha: 'old', iv: new Uint8Array(12), data: new ArrayBuffer(4) });
  await old.put('snapshot', { id: 'main', iv: new Uint8Array(12), data: new ArrayBuffer(4) });
  await old.put('keep', { id: 'overlay', iv: new Uint8Array(12), data: new ArrayBuffer(4) });
  await old.put('owner', { id: 'key' });
  await old.close();
  expect(await readCache()).toBeNull();
  expect(await db.getAll('blobs')).toEqual([]);
  expect(await db.getAll('keep')).toEqual([]);
  await db.tx(['snapshot'], 'readonly', (transaction) => {
    expect([...transaction.db.objectStoreNames]).toEqual(['blobs', 'keep', 'snapshot']);
  });
  const f = await fakeGitHub({ 'Ada.md': '# Ada' });
  expect((await sync(f.gh, null))!.files[0].text).toBe('# Ada');
});

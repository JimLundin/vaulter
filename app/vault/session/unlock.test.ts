import 'fake-indexeddb/auto';
import { afterEach, expect, test } from 'vitest';
import { database } from './idb.ts';
import { seal } from './sealed.ts';
import {
  closeKeys,
  forget,
  remembered,
  rememberedCredentials,
  saveSecretOverrides,
  unlock,
} from './unlock.ts';
import { vi } from 'vitest';

afterEach(async () => {
  await forget();
  await closeKeys();
  vi.restoreAllMocks();
});
const sealed = () => seal({ github: 'github_pat_x' }, 'a long password', undefined, 1000);

test('the password unlocks and the device remembers it', async () => {
  const s = await sealed();
  const u = await unlock(s, 'a long password');
  expect(u.github).toBe('github_pat_x');
  expect((await remembered(s))?.github).toBe('github_pat_x');
});

test('a wrong password throws and remembers nothing', async () => {
  const s = await sealed();
  await expect(unlock(s, 'nope')).rejects.toThrow();
  expect(await remembered(s)).toBeNull();
});

test('expiry forgets the device', async () => {
  const s = await sealed();
  await unlock(s, 'a long password', 0);
  expect(await remembered(s, 31 * 864e5)).toBeNull();
});

test('re-sealing (a new salt) signs the device out', async () => {
  await unlock(await sealed(), 'a long password');
  expect(await remembered(await sealed())).toBeNull();
});

test('the new device format removes remembered cache keys and stores only the credential key', async () => {
  await closeKeys();
  await new Promise<void>((resolve, reject) => {
    const removal = indexedDB.deleteDatabase('vault');
    removal.onsuccess = () => resolve();
    removal.onerror = () => reject(removal.error);
  });
  const old = database('vault', 4, { keys: 'id' });
  await old.put('keys', { id: 'device', cacheKey: 'obsolete' });
  await old.put('keys', { id: 'dev', cacheKey: 'obsolete' });
  await old.close();
  const s = await sealed();
  expect(await remembered(s)).toBeNull();
  await unlock(s, 'a long password');
  await closeKeys();
  const device = database('vault', 5, { keys: 'id' });
  const rows = await device.getAll<Record<string, unknown>>('keys');
  expect(rows).toHaveLength(1);
  expect(Object.keys(rows[0])).toEqual(['id', 'key', 'salt', 'expires']);
  expect(rows[0].key).toBeInstanceOf(CryptoKey);
  await device.close();
});

test('device credential choices are encrypted and merge onto freshly published preloads', async () => {
  const preload = {
    github: 'preloaded-github',
    openai: 'preloaded-openai',
    jina: 'preloaded-jina',
  };
  const s = await seal(preload, 'a long password', undefined, 1000);
  await unlock(s, 'a long password');
  await saveSecretOverrides(s, { openai: 'device-openai', jina: null });
  await closeKeys();
  const device = database('vault', 5, { keys: 'id' });
  const record = await device.get<Record<string, unknown>>('keys', 'device');
  expect(Object.keys(record!)).toEqual(['id', 'key', 'salt', 'expires', 'overrides']);
  expect(JSON.stringify(record)).not.toContain('device-openai');
  expect(record?.overrides).toEqual({ iv: expect.any(String), data: expect.any(String) });
  await device.close();
  const updated = await seal(
    { ...preload, github: 'rotated-github', openai: 'rotated-openai' },
    'a long password',
    s.kdf.salt,
    1000,
  );
  expect(await rememberedCredentials(updated)).toEqual({
    preloadedSecrets: { ...preload, github: 'rotated-github', openai: 'rotated-openai' },
    secretOverrides: { openai: 'device-openai', jina: null },
    secrets: { github: 'rotated-github', openai: 'device-openai' },
  });
  expect(await unlock(updated, 'a long password')).toEqual({
    github: 'rotated-github',
    openai: 'device-openai',
  });
});

test('reset restores the login credential and removes the encrypted override record', async () => {
  const s = await seal(
    { github: 'preloaded-github', openai: 'preloaded-openai' },
    'a long password',
    undefined,
    1000,
  );
  await unlock(s, 'a long password');
  await saveSecretOverrides(s, { openai: 'device-openai' });
  await saveSecretOverrides(s, {});
  expect(await remembered(s)).toEqual({ github: 'preloaded-github', openai: 'preloaded-openai' });
  await closeKeys();
  const device = database('vault', 5, { keys: 'id' });
  expect((await device.get<Record<string, unknown>>('keys', 'device'))?.overrides).toBeUndefined();
  await device.close();
});

test('expired logins and password rotation discard device credential choices', async () => {
  const s = await sealed();
  await unlock(s, 'a long password', 0);
  await saveSecretOverrides(s, { openai: 'device-openai' }, 1);
  expect(await remembered(s, 31 * 864e5)).toBeNull();
  expect(await unlock(s, 'a long password', 31 * 864e5)).toEqual({ github: 'github_pat_x' });
  await saveSecretOverrides(s, { openai: 'device-openai' }, 31 * 864e5);
  const changedPassword = await seal(
    { github: 'github_pat_x' },
    'another long password',
    s.kdf.salt,
    1000,
  );
  expect(await remembered(changedPassword, 31 * 864e5)).toBeNull();
  expect(await unlock(changedPassword, 'another long password', 31 * 864e5)).toEqual({
    github: 'github_pat_x',
  });
});

test('sign out removes device credentials and rejects later attempts to save them', async () => {
  const s = await sealed();
  await unlock(s, 'a long password');
  await saveSecretOverrides(s, { openai: 'device-openai' });
  await forget();
  expect(await remembered(s)).toBeNull();
  await expect(saveSecretOverrides(s, { openai: 'later-key' })).rejects.toThrow('Unlock');
});

test('failed encryption and invalid required credentials preserve the saved choices', async () => {
  const s = await sealed();
  await unlock(s, 'a long password');
  await saveSecretOverrides(s, { openai: 'device-openai' });
  const encrypt = vi
    .spyOn(crypto.subtle, 'encrypt')
    .mockRejectedValueOnce(new Error('Encryption unavailable'));
  await expect(saveSecretOverrides(s, { openai: 'replacement-key' })).rejects.toThrow(
    'Encryption unavailable',
  );
  encrypt.mockRestore();
  await expect(saveSecretOverrides(s, { github: null })).rejects.toThrow('GitHub token');
  await expect(saveSecretOverrides(s, { github: ' ' })).rejects.toThrow('GitHub token');
  expect(await remembered(s)).toEqual({ github: 'github_pat_x', openai: 'device-openai' });
});

test('a stale tab cannot overwrite credential choices saved by another tab', async () => {
  const s = await sealed();
  await unlock(s, 'a long password');
  await saveSecretOverrides(s, { openai: 'other-tab-key' });
  await expect(saveSecretOverrides(s, { jina: 'stale-tab-key' }, Date.now(), {})).rejects.toThrow(
    'another tab',
  );
  expect(await remembered(s)).toEqual({ github: 'github_pat_x', openai: 'other-tab-key' });
});

test('device write failure leaves the previously saved credentials intact', async () => {
  const s = await sealed();
  await unlock(s, 'a long password');
  await saveSecretOverrides(s, { openai: 'device-openai' });
  const write = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new Error('Device storage full');
  });
  await expect(saveSecretOverrides(s, { openai: 'replacement-key' })).rejects.toThrow(
    'Device storage full',
  );
  write.mockRestore();
  expect(await remembered(s)).toEqual({ github: 'github_pat_x', openai: 'device-openai' });
});

test('a sign-out from another tab during encryption cannot recreate the remembered key', async () => {
  const s = await sealed();
  await unlock(s, 'a long password');
  const original = crypto.subtle.encrypt.bind(crypto.subtle);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...arguments_) => {
    enter();
    await waiting;
    return original(...arguments_);
  });
  const saving = saveSecretOverrides(s, { openai: 'later-key' });
  await entered;
  const otherTab = database('vault', 5, { keys: 'id' });
  await otherTab.del('keys', 'device');
  await otherTab.close();
  release();
  await expect(saving).rejects.toThrow('Unlock');
  expect(await remembered(s)).toBeNull();
});

test('a concurrent tab update during encryption cannot be overwritten without Web Locks', async () => {
  const s = await sealed();
  await unlock(s, 'a long password');
  await saveSecretOverrides(s, { openai: 'first-key' });
  const otherTab = database('vault', 5, { keys: 'id' });
  const first = await otherTab.get<Record<string, unknown>>('keys', 'device');
  await saveSecretOverrides(s, { openai: 'other-tab-key' });
  const updated = await otherTab.get<Record<string, unknown>>('keys', 'device');
  await otherTab.put('keys', first);
  const original = crypto.subtle.encrypt.bind(crypto.subtle);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...arguments_) => {
    enter();
    await waiting;
    return original(...arguments_);
  });
  const saving = saveSecretOverrides(s, { jina: 'stale-key' }, Date.now(), { openai: 'first-key' });
  await entered;
  await otherTab.put('keys', updated);
  await otherTab.close();
  release();
  await expect(saving).rejects.toThrow('another tab');
  expect(await remembered(s)).toEqual({ github: 'github_pat_x', openai: 'other-tab-key' });
});

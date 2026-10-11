import 'fake-indexeddb/auto';
import { afterEach, expect, test } from 'vitest';
import { database } from './idb.ts';
import { seal } from './sealed.ts';
import { closeKeys, forget, remembered, unlock } from './unlock.ts';

afterEach(async () => {
  await forget();
  await closeKeys();
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

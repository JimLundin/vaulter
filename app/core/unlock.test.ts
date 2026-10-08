import 'fake-indexeddb/auto';
import { afterEach, expect, test } from 'vitest';
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
  expect(u.secrets.github).toBe('github_pat_x');
  expect((await remembered(s))?.secrets.github).toBe('github_pat_x');
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

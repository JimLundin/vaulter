import { expect, test } from 'vitest';
import { deriveKey, seal, unseal } from './sealed.ts';

// biome-ignore lint/security/noSecrets: a fixed test salt, public by design
const SALT = btoa('0123456789abcdef');

test('seals and opens with the right password only', async () => {
  const s = await seal({ github: 'ghp_x', openai: 'sk-y' }, 'correct horse', undefined, 1000);
  expect(s.kdf.iterations).toBe(1000);
  expect(JSON.stringify(s)).not.toContain('ghp_x');
  expect(await unseal(s, await deriveKey('correct horse', s.kdf.salt, 1000))).toEqual({
    github: 'ghp_x',
    openai: 'sk-y',
  });
  await expect(unseal(s, await deriveKey('wrong', s.kdf.salt, 1000))).rejects.toThrow();
});

test('each seal has its own salt and iv', async () => {
  const [a, b] = await Promise.all([
    seal({ github: 't' }, 'p', undefined, 1000),
    seal({ github: 't' }, 'p', undefined, 1000),
  ]);
  expect(a.kdf.salt).not.toBe(b.kdf.salt);
  expect(a.iv).not.toBe(b.iv);
});

test('with a fixed salt, a remembered key opens the next seal too (a new token, the same password)', async () => {
  const key = await deriveKey('p', SALT, 1000);
  const first = await seal({ github: 'old' }, 'p', SALT, 1000);
  const next = await seal({ github: 'new' }, 'p', SALT, 1000);
  expect(first.iv).not.toBe(next.iv);
  expect((await unseal(next, key)).github).toBe('new');
});

test('the derived key cannot be exported', async () => {
  const k = await deriveKey('p', SALT, 1000);
  expect(k.extractable).toBe(false);
  await expect(crypto.subtle.exportKey('raw', k)).rejects.toThrow();
});

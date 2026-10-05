import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { keyFor, open, seal } from './sealed.ts';
import type { Store } from './store.ts';
import { unsealer } from './unseal.ts';
import { vault } from './vault.ts';

const FAST = { iterations: 1000 };

const memoryStore = (): Store => {
  const m = new Map<string, unknown>();
  return {
    get: <T>(k: string) => Promise.resolve(m.get(k) as T | undefined),
    set: (k, v) => Promise.resolve(void m.set(k, v)),
    delete: (k) => Promise.resolve(void m.delete(k)),
    list: <T>(prefix = '') =>
      Promise.resolve(
        [...m].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)) as [
          string,
          T,
        ][],
      ),
  };
};
const salt = new Uint8Array(16).fill(7);

describe('sealed secrets', () => {
  it('open only with the password', async () => {
    const file = await seal('correct horse battery staple', { 'openai/key': 'sk-1' }, FAST);
    expect(JSON.stringify(file)).not.toContain('sk-1');
    expect(await open(await keyFor('correct horse battery staple', file.kdf), file)).toEqual({
      'openai/key': 'sk-1',
    });
    await expect(open(await keyFor('wrong', file.kdf), file)).rejects.toThrow();
  });

  it('are imported once with the password, then on their own for a new file with the same salt', async () => {
    const keep = memoryStore();
    const secrets = vault(keep);
    const u = unsealer(keep, secrets);
    const first = await seal(
      'pw-pw-pw-pw-pw-pw',
      { 'openai/key': 'sk-1', 'source-github/token': 'gh-1' },
      { ...FAST, salt },
    );
    expect(await u.check(async () => first)).toBe('locked');
    await expect(u.unlock('nope')).rejects.toThrow('does not open');
    await u.unlock('pw-pw-pw-pw-pw-pw');
    expect(await secrets.reveal('openai', 'key')).toBe('sk-1');
    expect(await secrets.reveal('source-github', 'token')).toBe('gh-1');
    expect(await u.check(async () => first)).toBe('imported');

    // A new deploy, a new key value: no password needed.
    const second = await seal('pw-pw-pw-pw-pw-pw', { 'openai/key': 'sk-2' }, { ...FAST, salt });
    expect(await u.check(async () => second)).toBe('imported');
    expect(await secrets.reveal('openai', 'key')).toBe('sk-2');

    // A new salt (or password): asked again.
    const third = await seal('pw-pw-pw-pw-pw-pw', { 'openai/key': 'sk-3' }, FAST);
    expect(await u.check(async () => third)).toBe('locked');
    expect(await u.check(() => Promise.reject(new Error('404')))).toBe('none');
  });

  it('are sealed in CI from VAULTER_SECRET__<EXTENSION>__<NAME>', async () => {
    const out = join(await mkdtemp(join(tmpdir(), 'vaulter-')), 'secrets.json');
    await promisify(execFile)(process.execPath, ['tools/seal-secrets.ts', out], {
      env: {
        VAULTER_PASSWORD: 'a-long-enough-password',
        VAULTER_SALT: btoa(String.fromCharCode(...salt)),
        VAULTER_SECRET__OPENAI__KEY: 'sk-ci',
        VAULTER_SECRET__SOURCE_GITHUB__TOKEN: 'gh-ci',
        GITHUB_TOKEN: 'not-sealed',
      },
    });
    const file = JSON.parse(await readFile(out, 'utf8'));
    expect(await open(await keyFor('a-long-enough-password', file.kdf), file)).toEqual({
      'openai/key': 'sk-ci',
      'source-github/token': 'gh-ci',
    });
  });
});

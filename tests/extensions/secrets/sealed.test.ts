import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { keyFor, open, seal } from '../../../extensions/secrets/sealed.ts';

const FAST = { iterations: 1000 };

const salt = new Uint8Array(16).fill(7);

describe('sealed secrets', () => {
  it('open only with the password', async () => {
    const file = await seal(
      'correct horse battery staple',
      { 'openai/key': 'sk-1' },
      FAST,
    );
    expect(JSON.stringify(file)).not.toContain('sk-1');
    expect(
      await open(await keyFor('correct horse battery staple', file.kdf), file),
    ).toEqual({
      'openai/key': 'sk-1',
    });
    await expect(open(await keyFor('wrong', file.kdf), file)).rejects.toThrow();
  });

  it('are sealed in CI from VAULTER_SECRET__<EXTENSION>__<NAME>', async () => {
    const out = join(await mkdtemp(join(tmpdir(), 'vaulter-')), 'secrets.json');
    await promisify(execFile)(
      process.execPath,
      ['tools/seal-secrets.ts', out],
      {
        // As CI names them: VAULTER_SECRET__<EXTENSION>__<NAME>, which no naming convention fits.
        env: Object.fromEntries([
          ['VAULTER_PASSWORD', 'a-long-enough-password'],
          ['VAULTER_SALT', btoa(String.fromCharCode(...salt))],
          ['VAULTER_SECRET__OPENAI__KEY', 'sk-ci'],
          ['VAULTER_SECRET__MAPS__TOKEN', 'gh-ci'],
          ['GITHUB_TOKEN', 'not-sealed'],
        ]),
      },
    );
    const file = JSON.parse(await readFile(out, 'utf8'));
    expect(
      await open(await keyFor('a-long-enough-password', file.kdf), file),
    ).toEqual({
      'openai/key': 'sk-ci',
      'maps/token': 'gh-ci',
    });
  });
});

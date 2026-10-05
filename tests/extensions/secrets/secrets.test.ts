import { expect, it } from 'vitest';
import { seal } from '../../../extensions/secrets/sealed.ts';
import { servePage, startApp } from '../../app.ts';

const PASSWORD = 'pw-pw-pw-pw-pw-pw';
const FAST = { iterations: 1000, salt: new Uint8Array(16).fill(7) };

/** The page, with `values` sealed into it, started. */
async function page(values: Record<string, string>) {
  servePage(await seal(PASSWORD, values, FAST), () =>
    Promise.reject(new Error('offline')),
  );
  await startApp(['secrets']);
  return import('#extensions/secrets');
}

it('opens with the password, then each new deploy on its own', async () => {
  const first = await page({ 'openai/key': 'sk-1' });
  expect(first.secret('openai/key')).toBeUndefined();
  await expect(first.unlock('nope')).rejects.toThrow('does not open');
  await first.unlock(PASSWORD);
  expect(first.secret('openai/key')).toBe('sk-1');

  // A new deploy with a new value: this device opens it with the key it kept.
  const second = await page({ 'openai/key': 'sk-2' });
  expect(second.secret('openai/key')).toBe('sk-2');
});

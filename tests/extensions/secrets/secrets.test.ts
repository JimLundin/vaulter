import { expect, it } from 'vitest';
import { seal } from '../../../extensions/secrets/sealed.ts';
import { servePage, startApp } from '../../app.ts';

const PASSWORD = 'pw-pw-pw-pw-pw-pw';
const FAST = { iterations: 1000, salt: new Uint8Array(16).fill(7) };
const declared = { key: ['api.openai.com'] };

/** The page, with `values` sealed into it, and the auth header of each other request it sends. */
const page = async (values: Record<string, string>, seen: [string, string | null][]) => {
  servePage(await seal(PASSWORD, values, FAST), (url, init) => {
    seen.push([String(url), new Headers(init?.headers).get('Authorization')]);
    return Promise.resolve(Response.json({ ok: true }));
  });
  await startApp(['secrets']);
  return import('#extensions/secrets');
};
const models = 'https://api.openai.com/v1/models';

it('opens the sealed secrets with the password, and a new deploy with the same salt on its own', async () => {
  const seen: [string, string | null][] = [];
  const first = await page({ 'caller/key': 'sk-1' }, seen);
  const net = first.netFor('caller', declared);
  await expect(net.fetch(models, { secret: 'key' })).rejects.toThrow('is not set');
  await expect(first.unlock('nope')).rejects.toThrow('does not open');
  await first.unlock(PASSWORD);
  await net.fetch(models, { secret: 'key' });

  // A new deploy with a new value: this device opens it with the key it kept.
  const second = await page({ 'caller/key': 'sk-2' }, seen);
  await second.netFor('caller', declared).fetch(models, { secret: 'key' });
  expect(seen).toEqual([
    [models, 'Bearer sk-1'],
    [models, 'Bearer sk-2'],
  ]);
});

it('attaches a secret only to the hosts declared for it, and only over https', async () => {
  const seen: [string, string | null][] = [];
  const secrets = await page({ 'caller/key': 'sk-1' }, seen);
  await secrets.unlock(PASSWORD);
  const net = secrets.netFor('caller', declared);
  const refused = (url: string, init?: { secret: string }) =>
    net.fetch(url, init).then(
      () => 'sent',
      (e: Error) => e.message,
    );
  expect([
    await refused('https://example.org/', { secret: 'key' }),
    await refused('https://example.org/', { secret: 'other' }),
    await refused('http://api.openai.com/'),
    await refused('https://example.org/'),
  ]).toEqual([
    'caller: the secret "key" is not for example.org',
    'caller: no secret named "other" is declared',
    'caller: only https requests (http://api.openai.com)',
    'sent',
  ]);
  expect(seen).toEqual([['https://example.org/', null]]);
});

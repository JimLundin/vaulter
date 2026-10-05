import { expect, it, vi } from 'vitest';
import { startApp } from '../../src/kernel/testing.ts';

// An extension with a secret for one host, and another host it may reach without one.
const about = {
  version: '1.0.0',
  network: ['example.org'],
  secrets: { key: { label: 'Key', hosts: ['api.openai.com'] } },
};

it('attaches a secret only to requests for its hosts, and forgets it with its extension', async () => {
  const seen: [string, string | null][] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    seen.push([url, new Headers(init?.headers).get('Authorization')]);
    return Promise.resolve(Response.json({ ok: true }));
  });
  const kernel = await startApp(['secrets'], {
    fixtures: { caller: { about, load: () => Promise.resolve({}) } },
  });
  const { netFor } = await import('./index.ts');
  const net = netFor('caller', about);
  await net.setSecret('caller', 'key', 'sk-123');

  const r = await net.fetch('https://api.openai.com/v1/models', { secret: 'key' });
  expect([await r.json(), await net.hasSecret('key')]).toEqual([{ ok: true }, true]);
  expect(seen).toEqual([['https://api.openai.com/v1/models', 'Bearer sk-123']]);
  const refused = (url: string, init?: { secret: string }) =>
    net.fetch(url, init).then(
      () => 'sent',
      (e: Error) => e.message,
    );
  expect([
    await refused('https://evil.test/'),
    await refused('https://example.org/', { secret: 'key' }),
    await refused('http://api.openai.com/'),
  ]).toEqual([
    'caller: evil.test is not among its declared hosts',
    'caller: the secret "key" is not for example.org',
    'caller: only https requests (http://api.openai.com)',
  ]);

  await kernel.remove('caller');
  expect(await net.secrets([{ extension: 'caller', name: 'key' }])).toEqual([
    { extension: 'caller', name: 'key', set: false },
  ]);
});

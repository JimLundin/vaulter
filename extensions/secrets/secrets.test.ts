import { net } from '@contracts/net';
import { afterEach, expect, it, vi } from 'vitest';
import { defineContract } from '../../src/kernel/contract.ts';
import type { Kernel } from '../../src/kernel/kernel.ts';
import { startRepo } from '../../src/kernel/testing.ts';

let kernel: Kernel | undefined;
afterEach(() => {
  kernel?.dispose();
  vi.unstubAllGlobals();
});

const probe = defineContract<{ run: () => Promise<unknown> }>({ name: 'probe', version: 1 });

// An extension with a secret for one host, and another host it may reach without one.
const CALLER = {
  'contracts/probe/index.ts': `import { defineContract } from '@vaulter/kernel';
    export const probe = defineContract({ name: 'probe', version: 1 });`,
  'extensions/caller/index.ts': `import { defineExtension } from '@vaulter/kernel';
    import { net } from '@contracts/net';
    import { probe } from '@contracts/probe';
    export default defineExtension({ id: 'caller', version: '1.0.0', requires: { net }, provides: { probe },
      permissions: { network: ['example.org'] },
      secrets: { key: { label: 'Key', hosts: ['api.openai.com'] } },
      setup({ net }) { return { probe: { async run() {
        const r = await net.fetch('https://api.openai.com/v1/models', { secret: 'key' });
        const errors = [];
        for (const [u, init] of [['https://evil.test/'], ['https://example.org/', { secret: 'key' }], ['http://api.openai.com/']]) {
          try { await net.fetch(u, init); } catch (e) { errors.push(e.message); }
        }
        return { body: await r.json(), has: await net.hasSecret('key'), errors };
      } } }; } });`,
};

it('attaches a secret only to requests for its hosts, and forgets it with its extension', async () => {
  const seen: [string, string | null][] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    seen.push([url, new Headers(init?.headers).get('Authorization')]);
    return Promise.resolve(Response.json({ ok: true }));
  });
  const r = await startRepo(['secrets'], CALLER);
  ({ kernel } = r);
  expect(r.refused).toEqual([]);
  const secrets = kernel.use(net, 'secrets');
  await secrets.setSecret('caller', 'key', 'sk-123');

  const out = (await kernel.use(probe).run()) as { body: unknown; has: boolean; errors: string[] };
  expect([out.body, out.has]).toEqual([{ ok: true }, true]);
  expect(seen).toEqual([['https://api.openai.com/v1/models', 'Bearer sk-123']]);
  expect(out.errors).toEqual([
    'caller: evil.test is not among its declared hosts',
    'caller: the secret "key" is not for example.org',
    'caller: only https requests (http://api.openai.com)',
  ]);

  await kernel.remove('caller');
  expect(await secrets.secrets([{ ext: 'caller', name: 'key' }])).toEqual([
    { ext: 'caller', name: 'key', set: false },
  ]);
});

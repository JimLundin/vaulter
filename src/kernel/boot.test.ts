import { afterEach, describe, expect, it } from 'vitest';
import type { Kernel } from './kernel.ts';
import { seal } from './sealed.ts';
import { REPO, startTree, testOut, testSource } from './testing.ts';
import { boot } from './boot.ts';
import { testDevice } from './testing.ts';

const ext = (
  id: string,
  version = '1.0.0',
  more = '',
) => `import { defineExtension } from '@vaulter/kernel';
    import { out } from '@vaulter/test';
  export default defineExtension({ id: '${id}', version: '${version}', ${more}
    async setup(_, kernel) { await out.set('${id}', 'started', '${version}'); } });`;

const shared = async () => ({
  '@vaulter/kernel': await import('./api.ts'),
  zod: await import('zod'),
  '@vaulter/test': { out: testOut() },
});

let kernels: Kernel[] = [];
afterEach(async () => {
  for (const k of kernels) await k.dispose();
  kernels = [];
});

describe('boot', () => {
  it('starts every extension at the branch, and asks for safe mode when no shell started', async () => {
    const r = await startTree({ 'extensions/map/index.ts': ext('map') });
    kernels.push(r.kernel);
    expect(r.started).toEqual(['map']);
    expect(r.booted.found).toEqual(['map']);
    expect(r.booted.commit).toMatch(/^main-/);
    expect(r.booted.safe?.reason).toMatch(/No shell is installed/);
  });

  it('starts offline from the last tree and compiled output this device loaded', async () => {
    const device = testDevice();
    const src = testSource({ main: { 'extensions/map/index.ts': ext('map') } });
    const opts = {
      source: { provide: src.source },
      defaultSource: `${REPO}@main`,
      shared: await shared(),
    };
    const online = await boot(device, opts);
    await online.kernel.dispose();
    src.offline = true;
    const offline = await boot(device, opts);
    kernels.push(offline.kernel);
    expect(offline.commit).toBe(online.commit);
    expect(offline.started).toEqual(['map']);
  });

  it('loads a pinned commit instead of the branch, and drafts the device tries on top', async () => {
    const old = { 'extensions/map/index.ts': ext('map', '1.0.0') };
    const src = testSource({ old });
    const pin = await src.source.head(REPO, 'old');
    const r = await startTree(
      { 'extensions/map/index.ts': ext('map', '2.0.0') },
      {
        branches: {
          old,
          'draft/notes': { ...old, 'extensions/notes/index.ts': ext('notes', '0.1.0') },
        },
        config: { pin, drafts: ['draft/notes'] },
      },
    );
    kernels.push(r.kernel);
    expect(await r.storage.get('map', 'started')).toBe('1.0.0');
    expect(await r.storage.get('notes', 'started')).toBe('0.1.0');
    expect(r.booted.origins).toEqual(new Map([['notes', 'draft/notes']]));
  });

  it('asks for the password when the page has sealed secrets this device cannot open yet', async () => {
    const file = await seal(
      'correct horse battery staple',
      { 'maps/token': 'pk.1' },
      {
        iterations: 1000,
      },
    );
    const asked: string[] = [];
    const r = await startTree(
      {
        'extensions/maps/index.ts': ext(
          'maps',
          '1.0.0',
          "secrets: { token: { label: 'Mapbox', hosts: ['api.mapbox.com'] } },",
        ),
      },
      {
        sealedFile: () => Promise.resolve(file),
        askPassword: async (sealed) => {
          asked.push('asked');
          await sealed.unlock('correct horse battery staple');
        },
      },
    );
    kernels.push(r.kernel);
    expect(asked).toEqual(['asked']);
    expect(await r.booted.secrets.reveal('maps', 'token')).toBe('pk.1');
  });

  it('in safe mode starts nothing but the source, and safe mode takes over when starting fails', async () => {
    const safe = await startTree({ 'extensions/map/index.ts': ext('map') }, { safe: true });
    kernels.push(safe.kernel);
    expect(safe.booted.safe).toEqual({});
    expect(safe.kernel.running()).toEqual([]);
    expect(safe.booted.found).toEqual(['map']);

    const src = testSource({ main: {} });
    src.offline = true;
    const failed = await boot(testDevice(), {
      source: { provide: src.source },
      defaultSource: `${REPO}@main`,
      shared: await shared(),
    });
    kernels.push(failed.kernel);
    expect(failed.safe?.reason).toBe('Failed to fetch');
  });
});

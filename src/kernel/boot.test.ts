import { afterEach, describe, expect, it } from 'vitest';
import { source } from '#contracts/extensions.source';
import { boot } from './boot.ts';
import type { AnyContract } from './contract.ts';
import type { Kernel } from './kernel.ts';
import { REPO, startTree, testDevice, testOut, testSource } from './testing.ts';

const ext = (
  id: string,
  version = '1.0.0',
  more = '',
) => `import { defineExtension } from '#kernel';
    import { out } from '#test';
  export default defineExtension({ id: '${id}', version: '${version}', ${more}
    async setup(_, kernel) { await out.set('${id}', 'started', '${version}'); } });`;

const shared = async () => ({
  '#kernel': await import('./api.ts'),
  zod: await import('zod'),
  '#test': { out: testOut() },
});

let kernels: Kernel[] = [];
afterEach(async () => {
  for (const k of kernels) await k.dispose();
  kernels = [];
});

describe('boot', () => {
  it('starts every extension in the page, and asks for safe mode when no shell started', async () => {
    const r = await startTree({ 'extensions/map/index.ts': ext('map') });
    kernels.push(r.kernel);
    expect(r.started).toEqual(['map']);
    expect(r.booted.found).toEqual(['map']);
    expect(r.booted.commit).toMatch(/^main-/);
    expect(r.booted.safe?.reason).toMatch(/No shell is installed/);
  });

  it('starts main from the page alone, with no source provider and nothing to reach', async () => {
    const booted = await boot(testDevice(), {
      page: { commit: 'abc1234', files: { 'extensions/map/index.ts': ext('map') } },
      defaultSource: `${REPO}@main`,
      shared: await shared(),
    });
    kernels.push(booted.kernel);
    expect(booted.started).toEqual(['map']);
    expect([booted.commit, booted.src]).toEqual(['abc1234', undefined]);
  });

  it('tries a draft offline from the tree this device last loaded for it', async () => {
    const main = { 'extensions/map/index.ts': ext('map') };
    const src = testSource({
      main,
      'draft/notes': { ...main, 'extensions/notes/index.ts': ext('notes', '0.1.0') },
    });
    const device = testDevice();
    await device.keep.set('config', { drafts: ['draft/notes'] });
    const opts = {
      page: { commit: await src.source.head(REPO, 'main'), files: main },
      defaultSource: `${REPO}@main`,
      shared: await shared(),
      provide: [[source, src.source]] as [AnyContract, object][],
    };
    const online = await boot(device, opts);
    online.kernel.dispose();
    src.offline = true;
    const offline = await boot(device, opts);
    kernels.push(offline.kernel);
    expect(offline.started.sort((a, b) => a.localeCompare(b))).toEqual(['map', 'notes']);
    expect(offline.origins).toEqual(new Map([['notes', 'draft/notes']]));
  });

  it('runs main without drafts when no source provider is running, and says so', async () => {
    const r = await startTree({ 'extensions/map/index.ts': ext('map') });
    kernels.push(r.kernel);
    const booted = await boot(testDevice({ keep: r.keep }), {
      page: { commit: 'abc1234', files: { 'extensions/map/index.ts': ext('map') } },
      defaultSource: `${REPO}@main`,
      shared: await shared(),
    });
    kernels.push(booted.kernel);
    expect(booted.started).toEqual(['map']);
    expect(booted.refused).toEqual([]);
    await r.keep.set('config', { drafts: ['draft/notes'] });
    const again = await boot(testDevice({ keep: r.keep }), {
      page: { commit: 'abc1234', files: { 'extensions/map/index.ts': ext('map') } },
      defaultSource: `${REPO}@main`,
      shared: await shared(),
    });
    kernels.push(again.kernel);
    expect(again.started).toEqual(['map']);
    expect(again.refused).toEqual([{ id: 'drafts', problems: ['no source provider is running'] }]);
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

  it('in safe mode starts nothing, and safe mode takes over when a pinned commit has no source', async () => {
    const safe = await startTree({ 'extensions/map/index.ts': ext('map') }, { safe: true });
    kernels.push(safe.kernel);
    expect(safe.booted.safe).toEqual({});
    expect(safe.kernel.running()).toEqual([]);
    expect(safe.booted.found).toEqual(['map']);

    const device = testDevice();
    await device.keep.set('config', { pin: 'abcdef1' });
    const pinned = await boot(device, {
      page: { commit: 'abc1234', files: { 'extensions/map/index.ts': ext('map') } },
      defaultSource: `${REPO}@main`,
      shared: await shared(),
    });
    kernels.push(pinned.kernel);
    expect(pinned.safe?.reason).toMatch(/a pinned commit needs a source provider/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceV1 } from '@contracts/extensions.source';
import { kernel as kernelContract } from '@contracts/kernel';
import { type ConfigStore, type Config, defaultConfig } from './config.ts';
import { control } from './control.ts';
import type { Kernel } from './kernel.ts';
import { secretStore } from './secrets.ts';
import { memoryKeep, startTree } from './testing.ts';

const memoryConfig = (): ConfigStore => {
  let c: Config = defaultConfig('o/r@main');
  return {
    get: () => c,
    update: (f) => {
      c = f(c);
      return Promise.resolve();
    },
  };
};

const files = {
  'contracts/probe/index.ts': `import { defineContract } from '@pip/kernel';
    export const probe = defineContract<{ run(): Promise<unknown> }>({ name: 'probe', version: '1.0.0' });`,
  'extensions/maps/index.ts': `import { defineExtension } from '@pip/kernel';
    export default defineExtension({ id: 'maps', version: '1.3.0',
      permissions: { network: ['tile.openstreetmap.org'] },
      secrets: { token: { label: 'Mapbox', hosts: ['api.mapbox.com'] } },
      agentGuide: 'Places on a map.', setup() {} });`,
  'extensions/broken/index.ts': `import { defineExtension } from '@pip/kernel';
    export default defineExtension({ id: 'broken', version: '1.0.0', setup() { throw new Error('no'); } });`,
  // An extension that requires the kernel contract and tries to change things on its own.
  'extensions/sneaky/index.ts': `import { defineExtension } from '@pip/kernel';
    import { kernel } from '@contracts/kernel';
    import { probe } from '@contracts/probe';
    export default defineExtension({ id: 'sneaky', version: '1.0.0', requires: { kernel }, provides: { probe },
      setup({ kernel }) { return { probe: { async run() {
        const list = (await kernel.extensions()).map((e) => e.id + ':' + e.status);
        let raised = 'raised';
        try { await kernel.setAccess('maps', 'tool:x', 'read'); } catch (e) { raised = e.message; }
        return { list, raised };
      } } }; } });`,
};

let k: Kernel | undefined;
afterEach(async () => {
  await k?.dispose();
});

describe('the kernel contract', () => {
  it('lists every extension with its status, and refuses changes not made by a person', async () => {
    const config = memoryConfig();
    const secrets = secretStore(memoryKeep());
    const src = { merge: vi.fn(async () => 'merged1'), refs: async () => ['main', 'draft/maps'] };
    let api: ReturnType<typeof control> | undefined;
    const r = await startTree(
      {
        ...files,
        'contracts/kernel/index.ts': await import('node:fs').then((fs) =>
          fs.readFileSync('contracts/kernel/index.ts', 'utf8'),
        ),
      },
      {
        secrets,
        provide: [
          [
            kernelContract,
            {
              // Filled in once the kernel exists.
              ...Object.fromEntries(
                Object.keys(kernelContract.inputs)
                  .concat([
                    'extensions',
                    'source',
                    'access',
                    'approvals',
                    'onApprovals',
                    'drafts',
                    'restart',
                  ])
                  .map((m) => [
                    m,
                    (...a: unknown[]) =>
                      (api as unknown as Record<string, (...x: unknown[]) => unknown>)[m](...a),
                  ]),
              ),
            },
          ],
        ],
      },
    );
    k = r.kernel;
    api = control({
      kernel: r.kernel,
      config,
      secrets,
      bundled: ['source-github'],
      found: () => ['maps', 'broken', 'sneaky'],
      origins: () => new Map([['maps', 'draft/maps']]),
      commit: () => 'abc',
      source: () => src as unknown as SourceV1,
      review: () => Promise.reject(new Error('not here')),
      restart: () => undefined,
    });

    const list = await api.extensions();
    const by = Object.fromEntries(list.map((e) => [e.id, e]));
    expect(by.maps).toMatchObject({
      status: 'running',
      version: '1.3.0',
      draft: 'draft/maps',
      permissions: { network: ['tile.openstreetmap.org'], device: [] },
      secrets: [{ name: 'token', label: 'Mapbox', hosts: ['api.mapbox.com'], set: false }],
      agentGuide: 'Places on a map.',
    });
    expect(by.broken).toMatchObject({ status: 'refused', problems: ['setup failed: no'] });
    expect(by['source-github']).toMatchObject({ bundled: true });

    // Through the kernel, from an extension with no person behind the call: reads yes, changes no.
    const probe = r.kernel.use(
      (await import('./contract.ts')).defineContract<{
        run: () => Promise<{ list: string[]; raised: string }>;
      }>({ name: 'probe', version: '1.0.0' }),
    );
    const out = await probe.run();
    expect(out.list).toContain('maps:running');
    expect(out.raised).toBe('kernel@1.setAccess is for a person to do, right after a tap or key');

    // Directly, as the kernel does for a person.
    await api.setAccess('maps', 'tool:x', 'ask');
    await api.setEnabled('broken', false);
    await api.tryDraft('draft/maps', true);
    expect(config.get()).toMatchObject({
      access: { 'maps/tool:x': 'ask' },
      disabled: ['broken'],
      drafts: ['draft/maps'],
    });
    expect(await api.drafts()).toEqual([
      { branch: 'draft/maps', extensions: ['maps'], loaded: true },
    ]);
    expect(await api.accept('draft/maps')).toBe('merged1');
    expect(src.merge).toHaveBeenCalledWith('o/r', 'main', 'draft/maps', 'Accept draft/maps');
    expect(config.get().drafts).toEqual([]);
    await api.setSecret('maps', 'token', 'pk.1');
    expect((await api.extensions()).find((e) => e.id === 'maps')?.secrets[0].set).toBe(true);
    await api.setSource({ pin: 'abcdef1' });
    expect(config.get().pin).toBe('abcdef1');
    await api.setSource({ pin: null });
    expect(config.get().pin).toBeUndefined();
  });
});

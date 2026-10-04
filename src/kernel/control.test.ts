import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { kernel as kernelContract } from '@contracts/kernel';
import { defineContract } from './contract.ts';
import type { Kernel } from './kernel.ts';
import { startTree } from './testing.ts';

const files: Record<string, string> = {
  'contracts/kernel/index.ts': readFileSync('contracts/kernel/index.ts', 'utf8'),
  'contracts/probe/index.ts': `import { defineContract } from '@vaulter/kernel';
    export const probe = defineContract<{ run(): Promise<unknown> }>({ name: 'probe', version: '1.0.0' });`,
  'extensions/maps/index.ts': `import { defineExtension } from '@vaulter/kernel';
    export default defineExtension({ id: 'maps', version: '1.3.0',
      permissions: { network: ['tile.openstreetmap.org'] },
      secrets: { token: { label: 'Mapbox', hosts: ['api.mapbox.com'] } },
      agentGuide: 'Places on a map.', setup() {} });`,
  'extensions/broken/index.ts': `import { defineExtension } from '@vaulter/kernel';
    export default defineExtension({ id: 'broken', version: '1.0.0', setup() { throw new Error('no'); } });`,
  // An extension that requires the kernel contract and tries to change things on its own.
  'extensions/sneaky/index.ts': `import { defineExtension } from '@vaulter/kernel';
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
afterEach(() => k?.dispose());

describe('the kernel contract', () => {
  it('lists every extension with its status, and refuses changes not made by a person', async () => {
    const r = await startTree(files, {
      branches: {
        'draft/maps': {
          ...files,
          'extensions/maps/index.ts': files['extensions/maps/index.ts'].replace(
            "'1.3.0'",
            "'1.4.0'",
          ),
        },
      },
      config: { drafts: ['draft/maps'] },
    });
    k = r.kernel;
    // As the kernel calls it for a person (safe mode, the review screen's taps).
    const api = r.kernel.use(kernelContract);
    const { config } = r.booted;

    const list = await api.extensions();
    const by = Object.fromEntries(list.map((e) => [e.id, e]));
    expect(by.maps).toMatchObject({
      status: 'running',
      version: '1.4.0',
      draft: 'draft/maps',
      permissions: { network: ['tile.openstreetmap.org'], device: [] },
      secrets: [{ name: 'token', label: 'Mapbox', hosts: ['api.mapbox.com'], set: false }],
      agentGuide: 'Places on a map.',
    });
    expect(by.broken).toMatchObject({ status: 'refused', problems: ['setup failed: no'] });

    // Through the kernel, from an extension with no person behind the call: reads yes, changes no.
    const probe = r.kernel.use(
      defineContract<{ run: () => Promise<{ list: string[]; raised: string }> }>({
        name: 'probe',
        version: '1.0.0',
      }),
    );
    const out = await probe.run();
    expect(out.list).toContain('maps:running');
    expect(out.raised).toBe('kernel@1.setAccess is for a person to do, right after a tap or key');

    await api.setAccess('maps', 'tool:x', 'ask');
    await api.setEnabled('broken', false);
    expect(config.get()).toMatchObject({
      access: { 'maps/tool:x': 'ask' },
      disabled: ['broken'],
      drafts: ['draft/maps'],
    });
    expect(await api.drafts()).toEqual([
      { branch: 'draft/maps', extensions: ['maps'], loaded: true },
    ]);
    await api.tryDraft('draft/maps', false);
    expect(config.get().drafts).toEqual([]);
    r.src.source.checks = async () => ({
      state: 'failure',
      runs: [{ name: 'test', state: 'failure' }],
    });
    await expect(api.tryDraft('draft/maps', true)).rejects.toThrow(/failed CI's checks/);
    await api.setSecret('maps', 'token', 'pk.1');
    expect((await api.extensions()).find((e) => e.id === 'maps')?.secrets[0].set).toBe(true);
    await api.setSource({ pin: 'abcdef1' });
    expect(config.get().pin).toBe('abcdef1');
    await api.setSource({ pin: null });
    expect(config.get().pin).toBeUndefined();
  });
});

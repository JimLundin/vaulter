import { afterEach, describe, expect, it } from 'vitest';
import { defineContract } from './contract.ts';
import { extensionIn } from './errors.ts';
import type { Kernel } from './kernel.ts';
import { startTree } from './testing.ts';
import { KERNEL_API } from './version.ts';

const BUS = `
import { defineContract } from '@pip/kernel';
export interface BusV1 {
  emit(text: string): Promise<number>;
  on(handler: (text: string) => void): Promise<() => void>;
  same(a: unknown, b: unknown): Promise<boolean>;
  fail(): Promise<void>;
}
export const bus = defineContract<BusV1>({ name: 'bus', version: '1.0.0' });`;

// A provider that remembers handlers per caller and lets go of a caller's when it stops.
const BUS_EXT = `
import { defineExtension, perCaller } from '@pip/kernel';
import { bus } from '@contracts/bus';
export default defineExtension({ id: 'bus', version: '1.0.0', provides: { bus },
  setup(_, kernel) {
    const handlers = new Map();
    let released = [];
    return { bus: perCaller((caller) => ({
      async emit(text) {
        let n = 0;
        for (const hs of handlers.values()) for (const h of hs) { await h(text); n++; }
        await kernel.storage.set('released', released);
        return n;
      },
      async on(h) { const hs = handlers.get(caller) ?? []; hs.push(h); handlers.set(caller, hs); return () => {}; },
      async same(a, b) { return a === b; },
      async fail() { throw new Error('bus broke'); },
    }), { release: (caller) => { handlers.delete(caller); released = [...released, caller]; } }) };
  } });`;

const listener = (id: string, extra = '') => `
import { defineExtension } from '@pip/kernel';
import { bus } from '@contracts/bus';
export default defineExtension({ id: '${id}', version: '1.0.0', requires: { bus }, ${extra}
  async setup({ bus }, kernel) {
    const runs = ((await kernel.storage.get('runs')) ?? 0) + 1;
    await kernel.storage.set('runs', runs);
    const h = async (t) => {
      if (t === 'boom') throw new Error('handler broke');
      await kernel.storage.set('heard', [...((await kernel.storage.get('heard')) ?? []), t]);
    };
    await bus.on(h);
    await kernel.storage.set('same', await bus.same(h, h));
    kernel.onStop(async () => { await kernel.storage.set('stopped', ((await kernel.storage.get('stopped')) ?? 0) + 1); });
  } });`;

const files = {
  'contracts/bus/index.ts': BUS,
  'extensions/bus/index.ts': BUS_EXT,
  'extensions/a/index.ts': listener('a'),
  'extensions/b/index.ts': listener('b'),
};
const busContract = defineContract<{
  emit: (t: string) => Promise<number>;
  fail: () => Promise<void>;
}>({
  name: 'bus',
  version: '1.0.0',
});

let kernel: Kernel | undefined;
afterEach(async () => {
  await kernel?.dispose();
});

describe('stopping and starting', () => {
  it('stops what requires an extension first, runs onStop, and lets providers release it', async () => {
    const r = await startTree(files);
    kernel = r.kernel;
    expect(r.refused).toEqual([]);
    const bus = kernel.use(busContract);
    expect(await bus.emit('one')).toBe(2);

    expect(await kernel.stop('a')).toEqual(['a']);
    expect(await r.storage.get('a', 'stopped')).toBe(1);
    // The provider let go of a's handler; b still hears.
    expect(await bus.emit('two')).toBe(1);
    expect(await r.storage.get('bus', 'released')).toEqual(['a']);
    expect(await r.storage.get('a', 'heard')).toEqual(['one']);
    expect(await r.storage.get('b', 'heard')).toEqual(['one', 'two']);

    // Stopping the provider stops what requires it, dependants first.
    expect(await kernel.stop('bus')).toEqual(['b', 'bus']);
    expect(kernel.running()).toEqual([]);
  });

  it('starts again live: reload restarts an extension and what stopped with it', async () => {
    const r = await startTree(files);
    kernel = r.kernel;
    const again = await kernel.reload(['bus']);
    expect(again.refused).toEqual([]);
    expect(
      kernel
        .running()
        .map((x) => x.id)
        .sort(),
    ).toEqual(['a', 'b', 'bus']);
    expect([await r.storage.get('a', 'runs'), await r.storage.get('a', 'stopped')]).toEqual([2, 1]);
    expect(await kernel.use(busContract).emit('after')).toBe(2);
  });

  it('keeps a function the same function when it is handed over twice', async () => {
    const r = await startTree(files);
    kernel = r.kernel;
    expect(await r.storage.get('a', 'same')).toBe(true);
  });

  it("makes a stopped extension's handlers go quiet even where the provider kept them", async () => {
    const leaky = BUS_EXT.replace(
      '{ release: (caller) => { handlers.delete(caller); released = [...released, caller]; } }',
      '{}',
    );
    const r = await startTree({ ...files, 'extensions/bus/index.ts': leaky });
    kernel = r.kernel;
    await kernel.stop('a');
    const bus = kernel.use(busContract);
    await bus.emit('later');
    expect(await r.storage.get('a', 'heard')).toBeUndefined();
    expect(await r.storage.get('b', 'heard')).toEqual(['later']);
  });
});

describe('errors', () => {
  it('are kept under the extension whose code threw', async () => {
    const r = await startTree(files);
    kernel = r.kernel;
    const bus = kernel.use(busContract);
    await expect(bus.fail()).rejects.toThrow('bus broke');
    await expect(bus.emit('boom')).rejects.toThrow('handler broke');
    expect(kernel.errors.of('bus').map((e) => [e.where, e.message])).toContainEqual([
      'call',
      'bus broke',
    ]);
    expect(kernel.errors.of('a').map((e) => [e.where, e.message])).toEqual([
      ['callback', 'handler broke'],
    ]);
    // Kept for the next start's safe mode.
    expect(Object.keys((await r.storage.get('kernel', 'errors')) as object)).toContain('a');
  });

  it('are traced to an extension by the source URL of its modules', () => {
    const stack =
      'Error: x\n    at h (pip:///abc1234/extensions/wiki/revise.ts:12:3)\n    at run (kernel.ts:1:1)';
    expect(extensionIn(stack)).toBe('wiki');
    expect(extensionIn('Error: x\n    at kernel.ts:1:1')).toBeUndefined();
  });

  it('mark an extension failing after several in a minute', async () => {
    const r = await startTree(files);
    kernel = r.kernel;
    for (let i = 0; i < 5; i++)
      await kernel
        .use(busContract)
        .fail()
        .catch(() => undefined);
    expect(kernel.errors.failing('bus')).toBe(true);
    expect(kernel.errors.failing('a')).toBe(false);
  });
});

it('refuses an extension written for a kernel API this kernel does not have', async () => {
  const [major, minor] = KERNEL_API.split('.').map(Number);
  const r = await startTree({
    ...files,
    'extensions/a/index.ts': listener('a', `kernel: '${major + 1}.0.0',`),
    'extensions/b/index.ts': listener('b', `kernel: '${major}.${minor}.0',`),
  });
  kernel = r.kernel;
  expect(r.refused).toEqual([
    { id: 'a', problems: [`needs kernel API ${major + 1}.0.0; this kernel has ${KERNEL_API}`] },
  ]);
  expect(
    kernel
      .running()
      .map((x) => x.id)
      .sort(),
  ).toEqual(['b', 'bus']);
});

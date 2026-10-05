import { afterEach, describe, expect, it } from 'vitest';
import { defineContract } from './contract.ts';
import type { Kernel } from './kernel.ts';
import { startTree } from './testing.ts';

const BUS = `
import { defineContract } from '#kernel';
export interface BusV1 {
  emit(text: string): Promise<number>;
  on(handler: (text: string) => void): Promise<() => void>;
  same(a: unknown, b: unknown): Promise<boolean>;
  fail(): Promise<void>;
}
export const bus = defineContract<BusV1>({ name: 'bus', version: 1 });`;

// A provider that remembers handlers per caller.
const BUS_EXT = `
import { defineExtension, perCaller } from '#kernel';
import { bus } from '#contracts/bus';
export default defineExtension({ id: 'bus', version: '1.0.0', provides: { bus },
  setup(_, kernel) {
    const handlers = new Map();
    return { bus: perCaller((caller) => ({
      async emit(text) {
        let n = 0;
        for (const hs of handlers.values()) for (const h of hs) { await h(text); n++; }
        return n;
      },
      async on(h) { const hs = handlers.get(caller) ?? []; hs.push(h); handlers.set(caller, hs); return () => {}; },
      async same(a, b) { return a === b; },
      async fail() { throw new Error('bus broke'); },
    })) };
  } });`;

const listener = (id: string, extra = '') => `
import { defineExtension } from '#kernel';
import { out } from '#test';
import { bus } from '#contracts/bus';
export default defineExtension({ id: '${id}', version: '1.0.0', requires: { bus }, ${extra}
  async setup({ bus }, kernel) {
    const runs = ((await out.get('${id}', 'runs')) ?? 0) + 1;
    await out.set('${id}', 'runs', runs);
    const h = async (t) => {
      if (t === 'boom') throw new Error('handler broke');
      await out.set('${id}', 'heard', [...((await out.get('${id}', 'heard')) ?? []), t]);
    };
    await bus.on(h);
    await out.set('${id}', 'same', await bus.same(h, h));
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
  version: 1,
});

let kernel: Kernel | undefined;
afterEach(async () => {
  await kernel?.dispose();
});

describe('errors', () => {
  it('pass functions across as they are', async () => {
    const r = await startTree(files);
    ({ kernel } = r);
    expect(await r.out.get('a', 'same')).toBe(true);
  });

  it('are kept under the extension whose code threw', async () => {
    const r = await startTree(files);
    ({ kernel } = r);
    const bus = kernel.use(busContract);
    await expect(bus.fail()).rejects.toThrow('bus broke');
    await expect(bus.emit('boom')).rejects.toThrow('handler broke');
    expect(kernel.errors.of('bus').map((e) => [e.where, e.message])).toContainEqual([
      'call',
      'bus broke',
    ]);
    // A's handler threw inside bus's emit: it is a's error, by the source its stack points into.
    expect(kernel.errors.of('a').map((e) => [e.where, e.message])).toEqual([
      ['call', 'handler broke'],
    ]);
    // Kept for the next start's safe mode.
    expect(Object.keys((await r.keep.get<object>('errors')) ?? {})).toContain('a');
  });
});

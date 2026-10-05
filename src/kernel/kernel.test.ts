import { describe, expect, it } from 'vitest';
import { blame } from './errors.ts';
import { startApp } from './testing.ts';

describe('the kernel', () => {
  it('starts what this device has on, and a preview only once it is turned on', async () => {
    const fixtures = {
      maps: { about: { version: '1.3.0' }, load: () => Promise.resolve({ ok: true }) },
      trails: {
        about: { version: '0.1.0', preview: true },
        load: () => Promise.resolve({ ok: true }),
      },
    };
    const settings = { current: { enabled: {} } };
    const before = await startApp([], { fixtures, settings });
    expect(before.extensions().map((e) => [e.id, e.status])).toEqual([
      ['maps', 'running'],
      ['trails', 'off'],
    ]);

    before.setEnabled('trails', true);
    before.setEnabled('maps', false);
    const after = await startApp([], { fixtures, settings });
    expect(after.extensions().map((e) => [e.id, e.status])).toEqual([
      ['maps', 'off'],
      ['trails', 'running'],
    ]);
  });

  it('keeps an extension that fails to start with why, and starts the rest', async () => {
    const kernel = await startApp([], {
      fixtures: {
        broken: { load: () => Promise.reject(new Error('no')) },
        maps: { load: () => Promise.resolve({}) },
      },
    });
    expect(kernel.extensions()).toMatchObject([
      { id: 'broken', status: 'failed', problem: 'no' },
      { id: 'maps', status: 'running' },
    ]);
  });

  it('removes an extension: every provider forgets it, and it is off', async () => {
    const forgot: string[] = [];
    const settings = { current: { enabled: {} } };
    const kernel = await startApp([], {
      settings,
      fixtures: {
        store: {
          load: () =>
            Promise.resolve({
              forget: (id: string) => {
                forgot.push(id);
                return Promise.resolve();
              },
            }),
        },
        maps: { load: () => Promise.resolve({}) },
      },
    });
    await kernel.remove('maps');
    expect(forgot).toEqual(['maps']);
    expect(settings.current).toEqual({ enabled: { maps: false } });
  });

  it('traces an error to the extension whose code threw it, built or not', () => {
    expect(
      blame(
        'Error: x\n    at h (/repo/extensions/wiki/revise.ts:12:3)\n    at k (/repo/src/kernel/kernel.ts:1:1)',
      ),
    ).toBe('wiki');
    expect(blame('Error: x\n    at h (https://v.app/assets/ext/store-local.Ab3_x9.js:1:2)')).toBe(
      'store-local',
    );
    expect(blame('Error: x\n    at k (https://v.app/assets/index.Cd4.js:1:1)')).toBeUndefined();
  });
});

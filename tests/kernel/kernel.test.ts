import { describe, expect, it } from 'vitest';
import { REPO, startApp } from '../app.ts';

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
});

it('starts every extension in the repo', async () => {
  const kernel = await startApp(REPO);
  expect(kernel.extensions().filter((e) => e.status !== 'running')).toEqual([]);
});

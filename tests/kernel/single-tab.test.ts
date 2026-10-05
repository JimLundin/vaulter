import { expect, it } from 'vitest';
import { claim } from '../../src/kernel/single-tab.ts';

it('lets one tab have Vaulter, and no other while it is open', async () => {
  expect(await claim()).toBe(true);
  expect(await claim()).toBe(false);
});

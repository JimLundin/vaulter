import { expect, it } from 'vitest';
import { singleTab } from './single-tab.ts';

const deps = () => ({
  locks: navigator.locks,
  channel: () => new BroadcastChannel('vaulter-kernel-test'),
});

it('lets one tab have the kernel, and hands it over when another asks', async () => {
  const first = singleTab(deps());
  const second = singleTab(deps());
  expect(await first.claim()).toBe(true);
  expect(await second.claim()).toBe(false);

  const order: string[] = [];
  first.onTakeOver(async () => {
    order.push('first stops');
  });
  await second.takeOver();
  order.push('second has it');
  expect(order).toEqual(['first stops', 'second has it']);
  expect(await singleTab(deps()).claim()).toBe(false);
  first.close();
  second.close();
});

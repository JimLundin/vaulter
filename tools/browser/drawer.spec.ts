import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports these browser types.
import type { Locator, Page } from '@playwright/test';

async function swipeDown(page: Page, surface: Locator) {
  const box = (await surface.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = box.x + box.width / 2;
  const y = box.y + 10;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  for (const distance of [30, 80, 160, 260, 360]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + distance }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

test('the compact supporting panel fills the available height and dismisses with a touch swipe', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/tests/browser.html');
  await page.getByRole('button', { name: 'Open agent' }).click();
  const panel = page.getByRole('dialog', { name: 'Agent', exact: true });
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThanOrEqual(843);
  await swipeDown(page, panel);
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open agent' })).toBeFocused();
});

test('Mobile design preview keeps touch dismissal inside its frame and leaves review controls usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/');
  const controls = page.getByRole('complementary', { name: 'Design preview' });
  await controls.getByRole('radio', { name: 'Mobile', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(drawer).toBeVisible();
  await expect
    .poll(async () => {
      const frame = (await page.locator('[data-design-viewport]').boundingBox())!;
      const box = (await drawer.boundingBox())!;
      return box.y + box.height <= frame.y + frame.height + 1;
    })
    .toBe(true);
  await swipeDown(page, drawer);
  await expect(drawer).toBeHidden();
  await controls.getByRole('radio', { name: 'Desktop', exact: true }).click();
  await expect(controls.getByRole('radio', { name: 'Desktop', exact: true })).toBeChecked();
});

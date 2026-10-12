import { expect, test } from '@playwright/test';

test('Chat supporting pane keeps one following feed, draft and accepted activity across close and resize', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/history/');
  const handle = page.locator('[data-preview-drag-handle]');
  for (let i = 0; i < 10; i++) await handle.press('Shift+ArrowDown');
  await page.keyboard.press('Control+j');
  let pane = page.getByRole(test.info().project.name === 'phone' ? 'dialog' : 'complementary', {
    name: 'Chat',
    exact: true,
  });
  await expect(pane).toBeVisible();
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('vault it: room for walks');
  await field.press('Enter');
  await expect(pane.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  await field.fill('Keep this unfinished thought');
  const original = await field.elementHandle();
  for (const width of [900, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    pane = page.getByRole(width < 768 ? 'dialog' : 'complementary', { name: 'Chat', exact: true });
    await expect(pane).toBeVisible();
    expect((await pane.boundingBox())!.height).toBe(844);
    await expect(field).toHaveValue('Keep this unfinished thought');
    expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await pane.locator('[data-slot="scroll-area-viewport"]').count()).toBe(1);
    const feed = (await pane.locator('[data-slot="scroll-area-viewport"]').boundingBox())!;
    const composer = (await pane.getByRole('group', { name: 'Message composer' }).boundingBox())!;
    expect(feed.y + feed.height).toBeLessThanOrEqual(composer.y);
  }
  const journal = await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'));
  await pane.getByRole('button', { name: 'Close chat', exact: true }).click();
  await expect(pane).toBeHidden();
  await page.keyboard.press('Control+j');
  await expect(field).toHaveValue('Keep this unfinished thought');
  await expect(pane.getByText('Filed in', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'))).toBe(
    journal,
  );
});

import { expect, test } from '@playwright/test';
import { setPreviewMobile } from './preview-controls.ts';

test('a closed Chat pane keeps lazy loading feedback out of the workspace', async ({ page }) => {
  let requested!: () => void;
  const pending = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let release!: () => void;
  const loaded = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/workflows/chat/Chat.tsx*', async (route) => {
    requested();
    await loaded;
    await route.continue();
  });
  try {
    await page.goto('/preview/#/history/');
    await pending;
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
    await expect(page.getByText('Loading conversation…', { exact: true })).toBeHidden();
    await page.keyboard.press('Control+j');
    await expect(page.getByText('Loading conversation…', { exact: true })).toBeVisible();
    await page.keyboard.press('Control+j');
    await expect(page.getByText('Loading conversation…', { exact: true })).toBeHidden();
    release();
    await page.keyboard.press('Control+j');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  } finally {
    release();
  }
});

test('Chat actions keep desktop conversations in the pane and compact access in an icon', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const presentation of ['page', 'supporting']) {
    await page.goto(
      `/preview/?conversations=numbered${presentation === 'supporting' ? '#/history/' : ''}`,
    );
    if (presentation === 'supporting') await page.keyboard.press('Control+j');
    const field = page.getByRole('textbox', { name: 'Message', exact: true });
    await field.fill('Keep this draft while choosing a conversation');
    const trigger = page.getByRole('button', { name: 'Conversations', exact: true });
    await expect(trigger).toBeHidden();
    await expect(
      page
        .getByRole('complementary', { name: 'Conversations', exact: true })
        .getByRole('button', { name: /Garden studio plans/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(
      1,
    );
    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeHidden();

    await setPreviewMobile(page.locator('body'), true);
    const handle = page.locator('[data-preview-drag-handle]');
    for (let i = 0; i < 10; i++) await handle.press('Shift+ArrowDown');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText('');
    await trigger.click();
    const chooser = page.getByRole('dialog', { name: 'Conversations', exact: true });
    await expect(chooser.getByRole('button', { name: /Garden studio plans/ })).toBeVisible();
    await chooser.getByRole('button', { name: 'Close conversations', exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(field).toHaveValue('Keep this draft while choosing a conversation');
    await setPreviewMobile(page.locator('body'), false);
    await expect(trigger).toBeHidden();
    await expect(
      page.getByRole('complementary', { name: 'Conversations', exact: true }),
    ).toBeVisible();
    await expect(field).toHaveValue('Keep this draft while choosing a conversation');
  }
});

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
    const conversations = pane.getByRole('button', { name: 'Conversations', exact: true });
    if (width < 768) await expect(conversations).toBeVisible();
    else await expect(conversations).toBeHidden();
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

test('pending Chat review survives pane closure and moves to the page with one shared dialog', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/preview/?legacy-staging#/history/');
  const handle = page.locator('[data-preview-drag-handle]');
  for (let i = 0; i < 10; i++) await handle.press('Shift+ArrowDown');
  await page.keyboard.press('Control+j');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('Review this retained message');
  await field.press('Enter');
  const review = page.getByRole('dialog', { name: 'Review pending changes', exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByText('Review this retained message', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(review).toBeHidden();
  await page.keyboard.press('Control+j');
  await expect(review).toBeVisible();
  await expect(review.getByText('Review this retained message', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    location.hash = '/chat/';
  });
  await expect(review).toHaveCount(1);
  await expect(review).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(review).toBeHidden();
  await page.keyboard.press('Control+j');
  await expect(
    page
      .getByRole('region', { name: 'Conversation', exact: true })
      .getByRole('textbox', { name: 'Message', exact: true }),
  ).toHaveValue('Review this retained message');
});

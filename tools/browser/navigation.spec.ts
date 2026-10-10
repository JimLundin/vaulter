import { expect, test } from '@playwright/test';
import { choosePreviewDevice } from './preview-controls.ts';

for (const theme of ['light', 'dark']) {
  test(`the current sidebar destination stays highlighted in ${theme} appearance`, async ({
    page,
  }, info) => {
    await page.goto('/preview/');
    await page.evaluate((appearance) => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(appearance);
      document.documentElement.style.colorScheme = appearance;
    }, theme);
    if (info.project.name === 'phone') {
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await menu.click();
      const agent = page.getByRole('link', { name: 'Agent', exact: true });
      const history = page.getByRole('link', { name: 'History', exact: true });
      const highlight = theme === 'light' ? 'rgb(244, 244, 245)' : 'rgb(39, 39, 42)';
      await expect(agent).toHaveAttribute('aria-current', 'page');
      await expect(agent).toHaveCSS('background-color', highlight);
      await expect(history).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await history.click();
      await menu.click();
      await expect(history).toHaveAttribute('aria-current', 'page');
      await expect(history).toHaveCSS('background-color', highlight);
      await expect(agent).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      return;
    }
    const agent = page.getByRole('link', { name: 'Agent', exact: true });
    const history = page.getByRole('link', { name: 'History', exact: true });
    const highlight = theme === 'light' ? 'rgb(228, 228, 231)' : 'rgb(39, 39, 42)';
    await expect(agent).toHaveAttribute('aria-current', 'page');
    await expect(agent).toHaveCSS('background-color', highlight);
    await expect(history).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await history.click();
    await page.mouse.move(1000, 500);
    await expect(history).toHaveAttribute('aria-current', 'page');
    await expect(history).toHaveCSS('background-color', highlight);
    await expect(agent).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    await settings.click();
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true, includeHidden: true }),
    ).toHaveCSS('background-color', highlight);
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await page.mouse.move(1000, 500);
    await expect(settings).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(history).toHaveCSS('background-color', highlight);
  });
}

test('Cmd and Ctrl B leave expanded navigation and the Agent draft available', async ({ page }) => {
  await page.goto('/preview/');
  await choosePreviewDevice(page.locator('body'), 'Desktop');
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Keep this draft beside the navigation');
  const history = page.getByRole('link', { name: 'History', exact: true });
  const before = (await history.boundingBox())!;
  for (const shortcut of ['Control+b', 'Meta+b']) {
    await draft.press(shortcut);
    await expect(draft).toHaveValue('Keep this draft beside the navigation');
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name === 'sidebar_state'),
      )
      .toBe(false);
    await expect.poll(async () => (await history.boundingBox())!.x).toBe(before.x);
    await expect.poll(async () => (await history.boundingBox())!.width).toBe(before.width);
  }
  await history.click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
});

import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(
    `the current sidebar destination stays highlighted in ${theme} appearance`,
    { tag: ['@phone', '@touch'] },
    async ({ page }, info) => {
      await page.goto('/preview/');
      await page.evaluate((appearance) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(appearance);
        document.documentElement.style.colorScheme = appearance;
      }, theme);
      if (info.project.name === 'phone') {
        const menu = page.getByRole('button', { name: 'Modules', exact: true });
        await menu.click();
        const agent = page.getByRole('menuitem', { name: 'Chat', exact: true });
        const wiki = page.getByRole('menuitem', { name: 'Wiki', exact: true });
        const highlight = theme === 'light' ? 'rgb(244, 244, 245)' : 'rgb(39, 39, 42)';
        await expect(agent).toHaveAttribute('aria-current', 'page');
        await expect(agent).toHaveCSS('background-color', highlight);
        await expect(wiki).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await wiki.click();
        await menu.click();
        await expect(wiki).toHaveAttribute('aria-current', 'page');
        await expect(wiki).toHaveCSS('background-color', highlight);
        await expect(agent).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        return;
      }
      const agent = page.getByRole('link', { name: 'Chat', exact: true });
      const wiki = page.getByRole('link', { name: 'Wiki', exact: true });
      const highlight = theme === 'light' ? 'rgb(228, 228, 231)' : 'rgb(39, 39, 42)';
      await expect(agent).toHaveAttribute('aria-current', 'page');
      await expect(agent).toHaveCSS('background-color', highlight);
      await expect(wiki).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      await wiki.click();
      await page.mouse.move(1000, 500);
      await expect(wiki).toHaveAttribute('aria-current', 'page');
      await expect(wiki).toHaveCSS('background-color', highlight);
      await expect(agent).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      const settings = page.getByRole('button', { name: 'Settings', exact: true });
      await settings.click();
      await expect(
        page.getByRole('button', { name: 'Settings', exact: true, includeHidden: true }),
      ).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      await page.mouse.move(1000, 500);
      await expect(settings).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(wiki).toHaveCSS('background-color', highlight);
    },
  );
}

test('Cmd and Ctrl B leave expanded navigation and the Agent draft available', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Keep this draft beside the navigation');
  const wiki = page.getByRole('link', { name: 'Wiki', exact: true });
  const before = (await wiki.boundingBox())!;
  for (const shortcut of ['Control+b', 'Meta+b']) {
    await draft.press(shortcut);
    await expect(draft).toHaveValue('Keep this draft beside the navigation');
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name === 'sidebar_state'),
      )
      .toBe(false);
    await expect.poll(async () => (await wiki.boundingBox())!.x).toBe(before.x);
    await expect.poll(async () => (await wiki.boundingBox())!.width).toBe(before.width);
  }
  await wiki.click();
  await expect(page.getByRole('heading', { name: 'Wiki', exact: true })).toBeVisible();
});

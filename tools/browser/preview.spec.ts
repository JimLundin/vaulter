import { expect, test } from '@playwright/test';

test('the mobile Menu highlights only while hovered or open, with rounded corners', async ({
  page,
}) => {
  await page.goto('/preview/');
  await page.getByRole('radio', { name: 'Mobile', exact: true }).click();
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await page.mouse.move(0, 0);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).not.toHaveAttribute('aria-current');
  await expect(menu).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(menu).toHaveCSS('border-radius', '8px');
  if (!(await page.evaluate(() => matchMedia('(hover: none)').matches))) {
    await menu.hover();
    await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await menu.click();
  await page.mouse.move(0, 0);
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link', { name: 'Agent', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await navigation.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).not.toHaveAttribute('aria-current');
  await expect(menu).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await menu.click();
  await expect(navigation.getByRole('link', { name: 'History', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await expect(menu).toBeFocused();
  await expect(menu).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('the preview banner stays above the entire workspace and device selection preserves the draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/');
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  const bar = (await banner.boundingBox())!;
  expect(bar.x).toBe(0);
  expect(bar.y).toBe(0);
  expect(bar.width).toBe(1440);
  const workspace = page.locator('[data-layout="desktop-workspace"]');
  expect((await workspace.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect((await page.locator('[data-region="nav"]').boundingBox())!.y).toBeGreaterThanOrEqual(
    bar.y + bar.height,
  );
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep my draft while reviewing the phone layout');
  await input.evaluate((node) => node.setAttribute('data-original-preview-draft', ''));
  const route = page.url();
  await banner.getByRole('radio', { name: 'Mobile', exact: true }).click();
  await expect(page.locator('[data-layout="mobile-workspace"]')).toBeVisible();
  const phone = page.locator('[data-design-viewport]');
  expect((await phone.boundingBox())!.width).toBe(390);
  await expect(phone.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while reviewing the phone layout');
  await expect(input).toHaveAttribute('data-original-preview-draft', '');
  expect(page.url()).toBe(route);
  await banner.getByRole('radio', { name: 'Desktop', exact: true }).click();
  await expect(workspace).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while reviewing the phone layout');
  await expect(input).toHaveAttribute('data-original-preview-draft', '');
  await banner.getByRole('radio', { name: 'Window', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-layout="mobile-workspace"]')).toBeVisible();
  const compactBar = (await banner.boundingBox())!;
  expect(compactBar.y).toBe(0);
  expect(compactBar.width).toBe(390);
  const header = (await page.locator('[data-brand]').boundingBox())!;
  expect(header.y).toBeGreaterThanOrEqual(compactBar.y + compactBar.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('preview device changes keep open settings and search inside the app frame', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/');
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const model = settings.getByRole('textbox', { name: 'Model', exact: true });
  await model.fill('A model selected during design review');
  await model.evaluate((node) => node.setAttribute('data-preview-model', ''));
  for (const mode of ['Mobile', 'Desktop', 'Mobile']) {
    await banner.getByRole('radio', { name: mode, exact: true }).click();
    await expect(settings).toBeVisible();
    await expect(model).toHaveValue('A model selected during design review');
    await expect(model).toHaveAttribute('data-preview-model', '');
    await expect
      .poll(async () => {
        const bounds = (await page.locator('[data-design-viewport]').boundingBox())!;
        const drawer = (await settings.boundingBox())!;
        return (
          drawer.x >= bounds.x - 1 &&
          drawer.y >= bounds.y - 1 &&
          drawer.x + drawer.width <= bounds.x + bounds.width + 1 &&
          drawer.y + drawer.height <= bounds.y + bounds.height + 1
        );
      })
      .toBe(true);
    expect(await page.locator('[data-design-viewport]').evaluate((node) => node.scrollTop)).toBe(0);
    if (mode === 'Mobile') await expect(settings).toHaveCSS('border-top-left-radius', '10px');
    else await expect(settings).toHaveCSS('border-top-left-radius', '12px');
  }
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Search or ask', exact: true });
  const query = search.getByRole('combobox');
  await query.fill('Garden');
  await banner.getByRole('radio', { name: 'Desktop', exact: true }).click();
  await expect(query).toHaveValue('Garden');
  await expect(search.getByRole('option', { name: /Garden studio/ })).toBeVisible();
  await banner.getByRole('radio', { name: 'Mobile', exact: true }).click();
  await expect(query).toHaveValue('Garden');
  await expect
    .poll(async () => {
      const frame = (await page.locator('[data-design-viewport]').boundingBox())!;
      const dialog = (await search.boundingBox())!;
      return Math.max(
        Math.abs(dialog.x - frame.x),
        Math.abs(dialog.y - frame.y),
        Math.abs(dialog.width - frame.width),
        Math.abs(dialog.height - frame.height),
      );
    })
    .toBeLessThanOrEqual(1);
});

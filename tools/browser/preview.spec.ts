import { expect, test } from '@playwright/test';
import { choosePreviewDevice } from './preview-controls.ts';

test('phone preview controls use one touch row and follow the visible browser height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { value: 664, writable: true },
      width: { value: 390 },
      offsetTop: { value: 0, writable: true },
      offsetLeft: { value: 0 },
    });
    Object.defineProperty(globalThis, 'visualViewport', { value: viewport });
  });
  await page.goto('/preview/');
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(async () => (await banner.boundingBox())!.height).toBeLessThanOrEqual(56);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const frame = (await page.locator('[data-design-preview]').boundingBox())!;
    expect(frame.y + frame.height).toBeLessThanOrEqual(664);
  }
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('Keep this mobile draft');
  await banner
    .getByRole('combobox', { name: 'Preview device', exact: true })
    .selectOption('mobile');
  await expect(banner.getByRole('combobox', { name: 'Input button variant' })).toHaveCount(0);
  await expect(field).toHaveValue('Keep this mobile draft');
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
  await banner
    .getByRole('combobox', { name: 'Preview device', exact: true })
    .dispatchEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    });
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { value: 500 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect
    .poll(async () => (await page.locator('[data-design-preview]').boundingBox())!.height)
    .toBe(500);
  const composer = (await page.getByRole('group', { name: 'Message composer' }).boundingBox())!;
  expect(composer.y + composer.height).toBeLessThanOrEqual(500);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'offsetTop', { value: 90 });
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await banner.boundingBox())!.y).toBe(90);
  const pannedComposer = (await page
    .getByRole('group', { name: 'Message composer' })
    .boundingBox())!;
  expect(pannedComposer.y + pannedComposer.height).toBeLessThanOrEqual(590);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe(
    'hidden',
  );
});

test('the desktop sidebar paints its full surface including the outer spacing', async ({
  page,
}) => {
  await page.goto('/preview/');
  await choosePreviewDevice(page.locator('body'), 'Desktop');
  const sidebar = page.locator('[data-region="nav"]');
  const colors = await sidebar.evaluate((node) => ({
    outer: getComputedStyle(node).backgroundColor,
    inner: getComputedStyle(node.querySelector('[data-slot="sidebar-inner"]')!).backgroundColor,
  }));
  expect(colors.outer).toBe(colors.inner);
  expect(colors.outer).not.toBe('rgba(0, 0, 0, 0)');
});

test('the mobile Menu highlights only while hovered or open, with rounded corners', async ({
  page,
}) => {
  await page.goto('/preview/');
  await choosePreviewDevice(page.locator('body'), 'Mobile');
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
  await choosePreviewDevice(banner, 'Mobile');
  await expect(page.locator('[data-layout="mobile-workspace"]')).toBeVisible();
  const phone = page.locator('[data-design-viewport]');
  expect((await phone.boundingBox())!.width).toBe(390);
  await expect(phone.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while reviewing the phone layout');
  await expect(input).toHaveAttribute('data-original-preview-draft', '');
  expect(page.url()).toBe(route);
  await choosePreviewDevice(banner, 'Desktop');
  await expect(workspace).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while reviewing the phone layout');
  await expect(input).toHaveAttribute('data-original-preview-draft', '');
  await choosePreviewDevice(banner, 'Window');
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
    await choosePreviewDevice(banner, mode);
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
  await choosePreviewDevice(banner, 'Desktop');
  await expect(query).toHaveValue('Garden');
  await expect(search.getByRole('option', { name: /Garden studio/ })).toBeVisible();
  await choosePreviewDevice(banner, 'Mobile');
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

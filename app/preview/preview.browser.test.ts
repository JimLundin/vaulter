import { expectAppActionFocus, openAppAction } from '../ui/kit/navigation.browser.test-support.ts';
import { expect, test } from '@playwright/test';
import { setPreviewMobile } from '../ui/kit/preview.browser.test-support.ts';

test('the preview handle drags without toggling controls, stays bounded, and supports keyboard reset', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.goto('/preview/');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  await expect(banner.getByRole('button', { name: 'Design variation', exact: true })).toHaveCount(
    0,
  );
  await expect(banner.getByText('Current design', { exact: true })).toHaveCount(0);
  const handle = banner.locator('[data-preview-drag-handle]');
  const original = (await banner.boundingBox())!;
  const grip = (await handle.boundingBox())!;
  await expect(handle).toHaveText('');
  expect(grip.x - original.x).toBeLessThanOrEqual(6);
  const startX = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX + 30, y: startY + 180 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 30, startY + 180, { steps: 5 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await banner.boundingBox())!.y).toBeCloseTo(original.y + 180, 0);
  const toggle = banner.getByRole('button', { name: 'Preview controls', exact: true });
  if (await toggle.count()) {
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  await setPreviewMobile(banner, true);
  await expect(page.locator('[data-layout="mobile-workspace"]')).toBeVisible();
  await expect.poll(async () => (await banner.boundingBox())!.y).toBeCloseTo(original.y + 180, 0);
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await banner.boundingBox())!.y).toBeCloseTo(original.y + 190, 0);
  for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowDown');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowRight');
  const moved = (await banner.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(moved.x + moved.width).toBeLessThanOrEqual(viewport.width - 7);
  expect(moved.y + moved.height).toBeLessThanOrEqual(viewport.height - 7);
  await page.setViewportSize({ width: 320, height: 500 });
  await expect
    .poll(async () => {
      const bounds = (await banner.boundingBox())!;
      return (
        bounds.x >= 8 &&
        bounds.y >= 8 &&
        bounds.x + bounds.width <= 313 &&
        bounds.y + bounds.height <= 493
      );
    })
    .toBe(true);
  await handle.focus();
  await page.keyboard.press('Home');
  await expect.poll(async () => (await banner.boundingBox())!.y).toBe(8);
  await expect
    .poll(async () => {
      const bounds = (await banner.boundingBox())!;
      return bounds.x + bounds.width / 2;
    })
    .toBeCloseTo(160, 0);
  expect((await page.locator('[data-design-viewport]').boundingBox())!.height).toBe(500);
});

test('phone preview controls expand from a centered pill and follow the visible browser height', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
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
  const viewport = page.locator('[data-design-viewport]');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(async () => (await banner.boundingBox())!.height).toBeLessThanOrEqual(56);
    const pill = (await banner.boundingBox())!;
    expect(pill.x).toBeGreaterThan(8);
    expect(Math.abs(pill.x + pill.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const frame = (await page.locator('[data-design-preview]').boundingBox())!;
    expect(frame.y + frame.height).toBeLessThanOrEqual(664);
    const app = (await viewport.boundingBox())!;
    expect(app.y).toBe(0);
    expect(app.height).toBe(664);
  }
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('Keep this mobile draft');
  const toggle = banner.getByRole('button', { name: 'Preview controls', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(banner.getByRole('button', { name: 'Mobile', exact: true })).toBeHidden();
  await setPreviewMobile(banner, true);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect((await viewport.boundingBox())!.y).toBe(0);
  expect((await viewport.boundingBox())!.height).toBe(664);
  for (const control of [
    banner.getByRole('button', { name: 'Mobile', exact: true }),
    banner.getByRole('button', { name: 'Move preview controls' }),
    toggle,
    banner.getByRole('link', { name: 'Component kit' }),
    banner.getByRole('button', { name: 'Reset demo' }),
  ]) {
    const target = await control.evaluate((node) => ({
      width: (node as HTMLElement).offsetWidth,
      height: (node as HTMLElement).offsetHeight,
    }));
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  await expect(banner.getByRole('combobox', { name: 'Input button variant' })).toHaveCount(0);
  await expect(field).toHaveValue('Keep this mobile draft');
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
  await banner.getByRole('button', { name: 'Mobile', exact: true }).dispatchEvent('keydown', {
    key: 'ArrowRight',
    bubbles: true,
  });
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await field.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(field).toHaveValue('Keep this mobile draft');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { value: 500 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect
    .poll(async () => (await page.locator('[data-design-preview]').boundingBox())!.height)
    .toBe(500);
  const composer = (await page.getByRole('group', { name: 'Message text box' }).boundingBox())!;
  expect(composer.y + composer.height).toBeLessThanOrEqual(500);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'offsetTop', { value: 90 });
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await banner.boundingBox())!.y).toBe(98);
  expect((await viewport.boundingBox())!.y).toBe(90);
  expect((await viewport.boundingBox())!.height).toBe(500);
  const pannedComposer = (await page
    .getByRole('group', { name: 'Message text box' })
    .boundingBox())!;
  expect(pannedComposer.y + pannedComposer.height).toBeLessThanOrEqual(590);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe(
    'hidden',
  );
});

test('the desktop sidebar paints its full surface including the outer spacing', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const sidebar = page.locator('[data-region="nav"]');
  const colors = await sidebar.evaluate((node) => ({
    outer: getComputedStyle(node).backgroundColor,
    inner: getComputedStyle(node.querySelector('[data-slot="sidebar-inner"]')!).backgroundColor,
  }));
  expect(colors.outer).toBe(colors.inner);
  expect(colors.outer).not.toBe('rgba(0, 0, 0, 0)');
});

test('the Modules anchor keeps its rounded surface and marks the selected destination in its menu', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.goto('/preview/');
  await setPreviewMobile(page.locator('body'), true);
  const menu = page.getByRole('button', { name: 'Modules', exact: true });
  await page.mouse.move(0, 0);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).not.toHaveAttribute('aria-current');
  await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(menu).toHaveCSS('border-radius', '12px');
  if (!(await page.evaluate(() => matchMedia('(hover: none)').matches))) {
    await menu.hover();
    await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await menu.click();
  await page.mouse.move(0, 0);
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const navigation = page.getByRole('menu', { name: 'App navigation', exact: true });
  await expect(navigation.getByRole('menuitem', { name: 'Chat', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await navigation.getByRole('menuitem', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).not.toHaveAttribute('aria-current');
  await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await menu.click();
  await expect(navigation.getByRole('menuitem', { name: 'History', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await expect(menu).toBeFocused();
  await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('the preview pill overlays the full-height workspace and device selection preserves the draft', {
  tag: '@phone',
}, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/');
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  const bar = (await banner.boundingBox())!;
  expect(bar.x).toBeGreaterThan(0);
  expect(bar.y).toBe(8);
  const touch = await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches);
  // Touch input keeps 44px targets even when the browser is resized to desktop width.
  expect(bar.width).toBeLessThan(touch ? 480 : 400);
  if (touch) {
    for (const control of await banner.locator('button, a').all()) {
      const target = (await control.boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(Math.abs(bar.x + bar.width / 2 - 720)).toBeLessThanOrEqual(1);
  const workspace = page.locator('[data-layout="desktop-workspace"]');
  expect((await workspace.boundingBox())!.y).toBe(0);
  expect((await workspace.boundingBox())!.height).toBe(1000);
  expect((await page.locator('[data-region="nav"]').boundingBox())!.y).toBe(0);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const mobile = banner.getByRole('button', { name: 'Mobile', exact: true });
  await expect(mobile).toHaveAttribute('aria-pressed', 'false');
  await expect(banner.getByRole('radio', { name: 'Window', exact: true })).toHaveCount(0);
  await expect(banner.getByRole('radio', { name: 'Desktop', exact: true })).toHaveCount(0);
  await input.fill('Keep my draft while reviewing the phone layout');
  await input.evaluate((node) => node.setAttribute('data-original-preview-draft', ''));
  const route = page.url();
  await setPreviewMobile(banner, true);
  await expect(mobile).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-layout="mobile-workspace"]')).toBeVisible();
  const phone = page.locator('[data-design-viewport]');
  expect((await phone.boundingBox())!.width).toBe(390);
  expect((await phone.boundingBox())!.y).toBe(0);
  expect((await phone.boundingBox())!.height).toBe(1000);
  await expect(phone.getByRole('button', { name: 'Modules', exact: true })).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while reviewing the phone layout');
  await expect(input).toHaveAttribute('data-original-preview-draft', '');
  expect(page.url()).toBe(route);
  await setPreviewMobile(banner, false);
  await expect(mobile).toHaveAttribute('aria-pressed', 'false');
  expect((await phone.boundingBox())!.width).toBe(1440);
  await expect(workspace).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while reviewing the phone layout');
  await expect(input).toHaveAttribute('data-original-preview-draft', '');
  await page.setViewportSize({ width: 800, height: 844 });
  await expect.poll(async () => (await phone.boundingBox())!.width).toBe(800);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-layout="mobile-workspace"]')).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while reviewing the phone layout');
  await expect(input).toHaveAttribute('data-original-preview-draft', '');
  const compactBar = (await banner.boundingBox())!;
  expect(compactBar.y).toBe(8);
  expect(compactBar.width).toBeLessThan(390);
  const content = (await page.locator('[data-layout="mobile-workspace"] > main').boundingBox())!;
  expect(content.y).toBe(0);
  expect((await phone.boundingBox())!.height).toBe(844);
  await expect(page.locator('[data-brand]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Modules', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'App navigation', exact: true });
  await expect(menu.getByText('Vaulter', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('preview device changes keep open settings and search inside the app frame', {
  tag: '@phone',
}, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/');
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  await openAppAction(page, 'Settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const model = settings.getByRole('combobox', { name: 'Model', exact: true });
  await model.selectOption({ label: 'Custom…' });
  const customModel = settings.getByRole('textbox', { name: 'Custom model', exact: true });
  await customModel.fill('A model selected during design review');
  await model.evaluate((node) => node.setAttribute('data-preview-model', ''));
  for (const mode of [true, false, true]) {
    await setPreviewMobile(banner, mode);
    await expect(settings).toBeVisible();
    await expect(model.locator('option:checked')).toHaveText('Custom…');
    await expect(customModel).toHaveValue('A model selected during design review');
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
    if (mode) await expect(settings).toHaveCSS('border-top-left-radius', '10px');
    else await expect(settings).toHaveCSS('border-top-left-radius', '12px');
  }
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await expectAppActionFocus(page, 'Settings');
  await openAppAction(page, 'Search');
  const search = page.getByRole('dialog', { name: 'Search or ask', exact: true });
  const query = search.getByRole('combobox');
  await query.fill('Garden');
  await setPreviewMobile(banner, false);
  await expect(query).toHaveValue('Garden');
  await expect(search.getByRole('option', { name: /Garden studio/ })).toBeVisible();
  await setPreviewMobile(banner, true);
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

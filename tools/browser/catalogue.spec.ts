import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports Locator from playwright-core.
import type { Locator } from '@playwright/test';

const specimen = (family: Locator, device: 'desktop' | 'mobile') =>
  family.locator(`[data-kit-preview="${device}"]`);
async function contained(outer: Locator, inner: Locator) {
  const bounds = (await outer.boundingBox())!;
  const content = (await inner.boundingBox())!;
  expect(content.x).toBeGreaterThanOrEqual(bounds.x - 1);
  expect(content.y).toBeGreaterThanOrEqual(bounds.y - 1);
  expect(content.x + content.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  expect(content.y + content.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
}

test('the entire catalogue renders paired live components without requests to external services', async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4179') external.push(request.url());
  });
  await page.goto('/ui/kit/');
  const families = page.locator('[data-kit-comparison]');
  await expect(families).toHaveCount(33);
  for (const family of await families.all()) {
    await expect(specimen(family, 'desktop')).toHaveCount(1);
    await expect(specimen(family, 'mobile')).toHaveCount(1);
    const desktop = (await specimen(family, 'desktop').boundingBox())!;
    const mobile = (await specimen(family, 'mobile').boundingBox())!;
    expect(desktop.width).toBe(800);
    expect(mobile.width).toBe(390);
    expect(mobile.x).toBeGreaterThan(desktop.x + desktop.width);
    expect(mobile.y).toBe(desktop.y);
  }
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('each sample retains its own responsive CSS, touch density and navigation at any browser width', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('Navigation & workspace');
  const family = page.locator('[data-kit-comparison="navigation"]');
  const desktop = specimen(family, 'desktop');
  const mobile = specimen(family, 'mobile');
  for (const width of [390, 1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(desktop.locator('[data-layout="desktop-workspace"]')).toHaveCount(1);
    await expect(mobile.locator('[data-layout="mobile-workspace"]')).toHaveCount(1);
    await expect(desktop.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(0);
    await expect(mobile.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(1);
    await expect(desktop.locator('[data-region="nav"]')).toBeVisible();
    await expect(mobile.locator('footer')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await filter.fill('Buttons & selection');
  const buttons = page.locator('[data-kit-comparison="buttons"]');
  const mouse = specimen(buttons, 'desktop').getByRole('button', { name: 'Small', exact: true });
  const touch = specimen(buttons, 'mobile').getByRole('button', { name: 'Small', exact: true });
  expect((await mouse.boundingBox())!.height).toBeLessThan(44);
  expect((await touch.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await filter.fill('Type & spacing');
  const type = page.locator('[data-kit-comparison="typography"]');
  await expect(specimen(type, 'desktop').getByRole('heading', { name: 'Room to think' })).toHaveCSS(
    'font-size',
    '40px',
  );
  await expect(specimen(type, 'mobile').getByRole('heading', { name: 'Room to think' })).toHaveCSS(
    'font-size',
    '32px',
  );
});

test('paired agent samples keep independent drafts and send through the shared one-row composer', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Agent conversation');
  const family = page.locator('[data-kit-comparison="agent"]');
  const desktop = specimen(family, 'desktop');
  const mobile = specimen(family, 'mobile');
  await desktop.getByRole('textbox', { name: 'Message', exact: true }).fill('A desktop thought');
  await mobile.getByRole('textbox', { name: 'Message', exact: true }).fill('A phone thought');
  await mobile.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
  await expect(mobile.locator('[data-message="user"]')).toContainText('A phone thought');
  await expect(desktop.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'A desktop thought',
  );
  await expect(desktop.locator('[data-message="user"]')).toHaveCount(0);
  const field = (await mobile
    .getByRole('textbox', { name: 'Message', exact: true })
    .boundingBox())!;
  const voice = (await mobile
    .getByRole('button', { name: 'Start voice interaction' })
    .boundingBox())!;
  expect(Math.abs(field.y + field.height / 2 - (voice.y + voice.height / 2))).toBeLessThan(1);
  expect(
    (await mobile.getByRole('group', { name: 'Message composer' }).boundingBox())!.height,
  ).toBeLessThanOrEqual(56);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(desktop.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'A desktop thought',
  );
});

test('settings and search portals remain inside their example without locking the catalogue', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('Settings');
  const family = page.locator('[data-kit-comparison="settings"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    const trigger = sample.getByRole('button', { name: 'Open settings' });
    await trigger.click();
    const dialog = sample.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () => {
        const outer = (await sample.boundingBox())!;
        const inner = (await dialog.boundingBox())!;
        return inner.y + inner.height - outer.y - outer.height;
      })
      .toBeLessThanOrEqual(1);
    await contained(sample, dialog);
    const input = dialog.getByRole('textbox', { name: 'Model', exact: true });
    await input.fill(`${device} model`);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(input).toHaveValue(`${device} model`);
    await page.keyboard.press('Escape');
    expect(await page.locator('body').evaluate((node) => node.style.overflow)).toBe('');
  }
  // Both specimens may stay open for direct visual comparison.
  for (const device of ['desktop', 'mobile'] as const)
    await specimen(family, device).getByRole('button', { name: 'Open settings' }).click();
  for (const device of ['desktop', 'mobile'] as const)
    await expect(
      specimen(family, device).getByRole('dialog', { name: 'Settings', exact: true }),
    ).toBeVisible();
  for (const device of ['desktop', 'mobile'] as const)
    await specimen(family, device).getByRole('button', { name: 'Close settings' }).click();
  await filter.fill('Search & commands');
  const search = page.locator('[data-kit-comparison="search"]');
  const sample = specimen(search, 'mobile');
  await sample.getByRole('button', { name: 'Search your vault', exact: true }).click();
  const dialog = sample.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await contained(sample, dialog);
  await expect(dialog.getByRole('combobox')).toBeFocused();
  await dialog.getByRole('combobox').fill('Coffee');
  await expect(dialog.getByRole('option', { name: 'Coffee with Anna' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('component-name search keeps comparisons side by side and scopes dropdown positioning', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('DropdownMenuCheckboxItem');
  await expect(page.locator('[data-kit-comparison]')).toHaveCount(1);
  const family = page.locator('[data-kit-comparison="menus"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    await sample.getByRole('button', { name: 'Note options' }).click();
    const menu = sample.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu).toBeVisible();
    await contained(sample, menu);
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await menu.getByRole('menuitemcheckbox', { name: 'Pinned' }).click();
    await sample.getByRole('button', { name: 'Note options' }).click();
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');
  }
  await filter.fill('not-a-component');
  await expect(page.getByText('No matching components.')).toBeVisible();
});

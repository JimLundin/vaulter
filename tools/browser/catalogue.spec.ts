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
  await expect(families).toHaveCount(37);
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
  await expect(
    desktop.getByRole('button', { name: 'Send', exact: true }).locator('svg'),
  ).toHaveClass(/lucide-corner-down-left/);
  await mobile.getByRole('textbox', { name: 'Message', exact: true }).fill('A phone thought');
  await expect(
    mobile.getByRole('button', { name: 'Send', exact: true }).locator('svg'),
  ).toHaveClass(/lucide-corner-down-left/);
  await expect(
    desktop.getByRole('button', { name: 'Send', exact: true }).locator('svg'),
  ).toHaveClass(/lucide-arrow-up/);
  await mobile.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
  await expect(mobile.locator('[data-message="user"]')).toContainText('A phone thought');
  await expect(desktop.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'A desktop thought',
  );
  await expect(desktop.locator('[data-message="user"]')).toHaveCount(0);
  const beforeDictation = (await mobile
    .getByRole('group', { name: 'Message composer' })
    .boundingBox())!;
  await mobile.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(mobile.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/^Leave/);
  expect((await mobile.getByRole('group', { name: 'Message composer' }).boundingBox())!.y).toBe(
    beforeDictation.y,
  );
  await expect(desktop.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'A desktop thought',
  );
  await mobile.getByRole('button', { name: 'Finish recording' }).click();
  await mobile
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Edited dictated thought');
  await mobile.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(mobile.locator('[data-message="user"] [data-surface="bubble"]').last()).toHaveText(
    'Edited dictated thought',
  );
  await expect(mobile.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
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

test('paired catalogue composers keep native and Safari IME confirmation as editing', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Agent conversation');
  const family = page.locator('[data-kit-comparison="agent"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    const field = sample.getByRole('textbox', { name: 'Message', exact: true });
    await field.fill('Composing a thought');
    await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
    await field.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
    await expect(field).toHaveValue('Composing a thought');
    await expect(sample.locator('[data-message="user"]')).toHaveCount(0);
    await field.press('Enter');
    await expect(sample.locator('[data-message="user"]')).toHaveCount(1);
  }
});

test('sidebar labels, badges and actions have separate slots at mouse and touch density', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Sidebar primitives');
  const family = page.locator('[data-kit-comparison="sidebar"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    const bounds = async (slot: string) =>
      (await sample.locator(`[data-slot="${slot}"]`).first().boundingBox())!;
    const label = await bounds('sidebar-group-label');
    const add = await bounds('sidebar-group-action');
    const button = await bounds('sidebar-menu-button');
    const badge = await bounds('sidebar-menu-badge');
    const action = await bounds('sidebar-menu-action');
    const nested = await bounds('sidebar-menu-sub-button');
    expect(label.x + label.width).toBeLessThanOrEqual(add.x);
    expect(add.y + add.height).toBeLessThanOrEqual(button.y);
    expect(badge.x + badge.width).toBeLessThanOrEqual(action.x);
    expect(action.y + action.height).toBeLessThanOrEqual(nested.y);
    expect(Math.abs(button.y + button.height / 2 - action.y - action.height / 2)).toBeLessThan(1);
    if (device === 'mobile') {
      expect(add.height).toBeGreaterThanOrEqual(44);
      expect(action.height).toBeGreaterThanOrEqual(44);
      expect(label.height).toBeGreaterThanOrEqual(44);
      expect((await bounds('sidebar-menu-skeleton')).height).toBeGreaterThanOrEqual(44);
    }
    await sample.getByRole('button', { name: 'Add feature' }).hover();
    await expect(sample.getByRole('button', { name: 'Add feature' })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    expect(
      await sample
        .getByRole('button', { name: 'Add feature' })
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).borderRadius)),
    ).toBeGreaterThan(0);
  }
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Buttons & selection');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(page.locator('[data-kit-comparison="buttons"]'), device);
    await expect(sample.getByRole('button', { name: 'Add note' })).toHaveCSS(
      'background-color',
      'rgb(24, 24, 27)',
    );
    await expect(sample.getByRole('button', { name: 'Add note' })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    await expect(sample.getByRole('button', { name: 'Square action' })).toHaveCSS(
      'border-radius',
      '0px',
    );
  }
});

test('submit actions sit inside fields and reserve room for editable text', async ({ page }) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('Agent conversation');
  const agent = page.locator('[data-kit-comparison="agent"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(agent, device);
    const input = sample.getByRole('textbox', { name: 'Message', exact: true });
    const send = sample.getByRole('button', { name: 'Send', exact: true });
    await input.fill('A message long enough to reach the inset send control');
    await contained(input, send);
    await expect
      .poll(async () => {
        const box = (await input.boundingBox())!;
        const action = (await send.boundingBox())!;
        const padding = await input.evaluate((node) =>
          Number.parseFloat(getComputedStyle(node).paddingRight),
        );
        return box.x + box.width - padding - action.x;
      })
      .toBeLessThanOrEqual(-4);
    await send.click();
    await expect(sample.locator('[data-message="user"]')).toHaveCount(1);
  }
  await filter.fill('Grouped inputs');
  const fields = page.locator('[data-kit-comparison="grouped-fields"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(fields, device);
    await contained(
      sample.getByRole('textbox', { name: 'Quick note' }),
      sample.getByRole('button', { name: 'Save quick note' }),
    );
  }
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

test('composition links reveal the catalogued primitive even when filtering', async ({ page }) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('Agent conversation');
  await page
    .locator('[data-kit-comparison="agent"] .kit-building-blocks')
    .getByRole('link', { name: 'Button', exact: true })
    .click();
  await expect(filter).toHaveValue('');
  await expect(page).toHaveURL(/#buttons$/);
  await expect(page.locator('[data-kit-comparison="buttons"]')).toBeInViewport();
});

test('paired Agent panels remain independently editable and Escape closes the active sample', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Agent panel');
  const family = page.locator('[data-kit-comparison="agent-panel"]');
  const desktop = specimen(family, 'desktop');
  const mobile = specimen(family, 'mobile');
  for (const sample of [desktop, mobile])
    await sample.getByRole('button', { name: 'Open agent panel' }).click();
  await desktop.getByRole('textbox', { name: 'Panel message' }).fill('Desktop draft');
  await mobile.getByRole('textbox', { name: 'Panel message' }).fill('Phone draft');
  await expect(desktop.getByRole('textbox', { name: 'Panel message' })).toHaveValue(
    'Desktop draft',
  );
  await page.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog', { name: 'Agent', exact: true })).toBeHidden();
  await expect(desktop.getByRole('dialog', { name: 'Agent', exact: true })).toBeVisible();
  await desktop.getByRole('textbox', { name: 'Panel message' }).focus();
  await page.keyboard.press('Escape');
  await expect(desktop.getByRole('button', { name: 'Open agent panel' })).toBeFocused();
  expect(await page.locator('body').evaluate((node) => node.style.overflow)).toBe('');
});

test('paired panel composers submit once with the shared keyboard path and retain drafts when reopened', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Agent panel');
  const family = page.locator('[data-kit-comparison="agent-panel"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    await sample.getByRole('button', { name: 'Open agent panel' }).click();
    const field = sample.getByRole('textbox', { name: 'Panel message' });
    await field.fill(`${device} composed thought`);
    await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
    await field.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
    await expect(field).toHaveValue(`${device} composed thought`);
    await expect(sample.locator('[data-message="user"]')).toHaveCount(0);
    await field.press('Enter');
    await expect(sample.locator('[data-message="user"]')).toHaveCount(1);
    await expect(field).toHaveValue('');
    await field.fill(`${device} unfinished thought`);
    await page.keyboard.press('Escape');
    await sample.getByRole('button', { name: 'Open agent panel' }).click();
    await expect(field).toHaveValue(`${device} unfinished thought`);
    await sample.getByRole('button', { name: 'Send panel message' }).click();
    await expect(sample.locator('[data-message="user"]')).toHaveCount(2);
    await page.keyboard.press('Escape');
  }
});

test('catalogue suggestions fill and focus their own public Composer field', async ({ page }) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Agent conversation');
  const family = page.locator('[data-kit-comparison="agent"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    await sample.getByRole('button', { name: 'Make room for slow mornings', exact: true }).click();
    const field = sample.getByRole('textbox', { name: 'Message', exact: true });
    await expect(field).toHaveValue('Make room for slow mornings');
    await expect(field).toBeFocused();
    await expect(sample.locator('[data-message="user"]')).toHaveCount(0);
  }
});

import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports Locator from playwright-core.
import type { Locator } from '@playwright/test';

const specimen = (family: Locator, device: 'desktop' | 'mobile') =>
  family.locator(`.kit-comparison-pair > .kit-device > [data-kit-preview="${device}"]`);
async function contained(outer: Locator, inner: Locator) {
  const bounds = (await outer.boundingBox())!;
  const content = (await inner.boundingBox())!;
  expect(content.x).toBeGreaterThanOrEqual(bounds.x - 1);
  expect(content.y).toBeGreaterThanOrEqual(bounds.y - 1);
  expect(content.x + content.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  expect(content.y + content.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
}

test('paired text boxes retain independent longform drafts and scope their floating-control clearance', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Text box');
  const family = page.locator('[data-kit-comparison="text-box"]');
  const mobile = specimen(family, 'mobile');
  const desktop = specimen(family, 'desktop');
  const mobileAnswer = mobile.getByRole('textbox', { name: 'Long answer', exact: true });
  const desktopAnswer = desktop.getByRole('textbox', { name: 'Long answer', exact: true });
  await expect(mobileAnswer).toHaveValue('');
  await expect(desktopAnswer).toHaveValue('');
  await mobileAnswer.fill('Mobile answer');
  await mobileAnswer.press('End');
  await mobileAnswer.press('Shift+Enter');
  await desktopAnswer.fill('Desktop answer');
  await desktopAnswer.evaluate((node) => node.setAttribute('data-original-field', ''));
  for (const width of [1000, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(mobileAnswer).toHaveValue('Mobile answer\n');
    await expect(desktopAnswer).toHaveValue('Desktop answer');
    await expect(desktopAnswer).toBeFocused();
    await expect(desktopAnswer).toHaveAttribute('data-original-field', '');
    await expect(desktop.locator('[data-edge-rail]')).toHaveCount(0);
    await expect(desktop.locator('[data-edge-input-lane]')).toHaveCount(0);
  }
  const save = mobile.getByRole('button', { name: 'Save answer', exact: true });
  await save.scrollIntoViewIfNeeded();
  await mobileAnswer.blur();
  await expect
    .poll(async () => {
      const rail = (await mobile.locator('[data-edge-rail]').boundingBox())!;
      const entry = (await mobile
        .getByRole('group', { name: 'Long answer text box', exact: true })
        .boundingBox())!;
      return entry.x + entry.width <= rail.x - 11;
    })
    .toBe(true);
  await mobileAnswer.press('Enter');
  await expect(mobileAnswer).toHaveValue('');
  await expect(mobile.getByRole('status')).toHaveText('Saved: Mobile answer');
  await expect(desktopAnswer).toHaveValue('Desktop answer');
  const instructions = mobile.getByRole('textbox', { name: 'Instructions', exact: true });
  await instructions.fill('Keep this local setting');
  await instructions.press('End');
  await instructions.press('Enter');
  await expect(instructions).toHaveValue('Keep this local setting');
  await instructions.press('Shift+Enter');
  await expect(instructions).toHaveValue('Keep this local setting\n');
  await expect(desktop.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveValue(
    'Use concise answers.',
  );
});

test('the entire catalogue renders paired live components without requests to external services', {
  tag: '@phone',
}, async ({ page, baseURL }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url());
  });
  await page.goto('/ui/kit/');
  const families = page.locator('[data-kit-comparison]');
  await expect(families).toHaveCount(39);
  const pairs = await families.evaluateAll((elements) =>
    elements.map((family) =>
      (['desktop', 'mobile'] as const).map((device) => {
        const samples = family.querySelectorAll(
          `.kit-comparison-pair > .kit-device > [data-kit-preview="${device}"]`,
        );
        const { x, y, width } = samples[0].getBoundingClientRect();
        return { count: samples.length, x, y, width };
      }),
    ),
  );
  for (const [desktop, mobile] of pairs) {
    expect(desktop.count).toBe(1);
    expect(mobile.count).toBe(1);
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

test('each sample retains its own responsive CSS, touch density and navigation at any browser width', {
  tag: '@phone',
}, async ({ page }) => {
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
    await expect(desktop.getByRole('button', { name: 'Modules', exact: true })).toHaveCount(0);
    await expect(mobile.getByRole('button', { name: 'Modules', exact: true })).toHaveCount(1);
    await expect(desktop.locator('[data-region="nav"]')).toBeVisible();
    await expect(mobile.locator('[data-edge-rail]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await filter.fill('Buttons & selection');
  const buttons = page.locator('[data-kit-comparison="buttons"]');
  const mouse = specimen(buttons, 'desktop').getByRole('button', { name: 'Compact', exact: true });
  const touch = specimen(buttons, 'mobile').getByRole('button', { name: 'Compact', exact: true });
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
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Feed & composer');
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
  await expect(desktop.getByRole('button', { name: 'Start voice interaction' })).toBeVisible();
  await expect(
    desktop.getByRole('group', { name: 'Message text box' }).getByRole('button'),
  ).toHaveCount(1);
  await mobile.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
  await expect(mobile.locator('[data-message="user"]')).toContainText('A phone thought');
  await expect(desktop.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'A desktop thought',
  );
  await expect(desktop.locator('[data-message="user"]')).toHaveCount(0);
  await expect(mobile.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await mobile.getByRole('textbox', { name: 'Message', exact: true }).blur();
  const beforeDictation = (await mobile
    .getByRole('group', { name: 'Message text box' })
    .boundingBox())!;
  await mobile.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(mobile.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/^Leave/);
  expect((await mobile.getByRole('group', { name: 'Message text box' }).boundingBox())!.y).toBe(
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
  await expect(mobile.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await mobile.getByRole('textbox', { name: 'Message', exact: true }).blur();
  const field = (await mobile
    .getByRole('textbox', { name: 'Message', exact: true })
    .boundingBox())!;
  const voice = (await mobile
    .getByRole('button', { name: 'Start voice interaction' })
    .boundingBox())!;
  expect(Math.abs(field.y + field.height / 2 - (voice.y + voice.height / 2))).toBeLessThan(1);
  expect(
    (await mobile.getByRole('group', { name: 'Message text box' }).boundingBox())!.height,
  ).toBeLessThanOrEqual(56);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(desktop.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'A desktop thought',
  );
});

test('sidebar labels, badges and actions have separate slots at mouse and touch density', {
  tag: '@touch',
}, async ({ page }) => {
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
    await expect(sample.getByRole('button', { name: 'Agent options' })).toHaveCSS('opacity', '1');
    const loading = sample.locator('[data-slot="sidebar-menu-skeleton"]');
    await expect(loading).toHaveCount(2);
    await expect(loading.locator('[data-sidebar="menu-skeleton-icon"]')).toHaveCount(1);
    for (const text of await loading.locator('[data-sidebar="menu-skeleton-text"]').all()) {
      expect((await text.boundingBox())!.height).toBeGreaterThan(0);
    }
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
      '8px',
    );
  }
});

test('submit actions sit inside fields and reserve room for editable text', async ({ page }) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('Feed & composer');
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

test('paired settings fields keep independent accessible meaning and native label targets', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Settings');
  const family = page.locator('[data-kit-comparison="settings"]');
  const desktop = specimen(family, 'desktop');
  const mobile = specimen(family, 'mobile');
  for (const sample of [desktop, mobile]) {
    await sample.getByRole('button', { name: 'Open settings' }).click();
  }
  const first = desktop.getByRole('combobox', { name: 'Model', exact: true });
  const second = mobile.getByRole('combobox', { name: 'Model', exact: true });
  expect(await first.getAttribute('id')).not.toBe(await second.getAttribute('id'));
  for (const sample of [desktop, mobile]) {
    const select = sample.getByRole('combobox', { name: 'Model', exact: true });
    await expect(select).toHaveAccessibleDescription('Used for conversations on this device.');
    await sample.getByText('Model', { exact: true }).click();
    await expect(select).toBeFocused();
  }
  await expect(first).not.toBeFocused();
  await expect(second).toBeFocused();
  for (const sample of [desktop, mobile]) {
    const dialog = sample.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(
      dialog.getByRole('radiogroup', { name: 'Theme', exact: true }),
    ).toHaveAccessibleDescription('Choose how Vaulter looks.');
    await dialog.getByRole('combobox', { name: 'Model', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});

test('settings and search portals remain inside their example without locking the catalogue', {
  tag: '@touch',
}, async ({ page }) => {
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
    await expect(
      dialog.getByRole('radiogroup', { name: 'Theme', exact: true }),
    ).toHaveAccessibleDescription('Choose how Vaulter looks.');
    await expect
      .poll(async () => {
        const outer = (await sample.boundingBox())!;
        const inner = (await dialog.boundingBox())!;
        return inner.y + inner.height - outer.y - outer.height;
      })
      .toBeLessThanOrEqual(1);
    await contained(sample, dialog);
    const select = dialog.getByRole('combobox', { name: 'Model', exact: true });
    await expect(select).toHaveAccessibleDescription('Used for conversations on this device.');
    await dialog.getByText('Model', { exact: true }).click();
    await expect(select).toBeFocused();
    const value = device === 'desktop' ? 'balanced' : 'fast';
    await select.selectOption(value);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(select).toHaveValue(value);
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
  await sample.getByRole('button', { name: 'Choose an item', exact: true }).click();
  const dialog = sample.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await contained(sample, dialog);
  await expect(dialog.getByRole('combobox')).toBeFocused();
  await expect(dialog.getByText('No matching items.', { exact: true })).toBeHidden();
  await dialog.getByRole('combobox').fill('Second');
  await expect(dialog.getByRole('option', { name: 'Second item' })).toBeVisible();
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await dialog.getByRole('combobox').fill('no matching note');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog.getByText('No matching items.', { exact: true })).toBeVisible();
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
  await filter.fill('Feed & composer');
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
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Supporting feed');
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
  await expect(mobile.getByRole('dialog', { name: 'Supporting task', exact: true })).toBeHidden();
  await expect(
    desktop.getByRole('complementary', { name: 'Supporting task', exact: true }),
  ).toBeVisible();
  await desktop.getByRole('textbox', { name: 'Panel message' }).focus();
  await page.keyboard.press('Escape');
  await expect(desktop.getByRole('button', { name: 'Open agent panel' })).toBeFocused();
  expect(await page.locator('body').evaluate((node) => node.style.overflow)).toBe('');
});

test('paired panel composers submit once with the shared keyboard path and retain drafts when reopened', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Supporting feed');
  const family = page.locator('[data-kit-comparison="agent-panel"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    await sample.getByRole('button', { name: 'Open agent panel' }).click();
    const field = sample.getByRole('textbox', { name: 'Panel message' });
    await field.fill(`${device} composed thought`);
    await expect(field).toHaveValue(`${device} composed thought`);
    await expect(sample.locator('[data-message="user"]')).toHaveCount(0);
    await field.press('Enter');
    await expect(sample.locator('[data-message="user"]')).toHaveCount(1);
    await expect(field).toHaveValue('');
    await field.fill(`${device} unfinished thought`);
    await page.keyboard.press('Escape');
    await expect(sample.getByRole('dialog', { name: 'Supporting task', exact: true })).toBeHidden();
    await expect(sample.getByRole('button', { name: 'Open agent panel' })).toBeFocused();
    await sample.getByRole('button', { name: 'Open agent panel' }).click();
    await expect(field).toHaveValue(`${device} unfinished thought`);
    await sample.getByRole('button', { name: 'Send panel message' }).click();
    await expect(sample.locator('[data-message="user"]')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(sample.getByRole('dialog', { name: 'Supporting task', exact: true })).toBeHidden();
  }
});

test('catalogue focus and outside interaction revoke a panel’s keyboard ownership after sending', {
  tag: '@touch',
}, async ({ page }) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('Supporting feed');
  const family = page.locator('[data-kit-comparison="agent-panel"]');
  const desktop = specimen(family, 'desktop');
  const mobile = specimen(family, 'mobile');
  for (const sample of [desktop, mobile])
    await sample.getByRole('button', { name: 'Open agent panel' }).click();
  await mobile.getByRole('textbox', { name: 'Panel message' }).fill('Completed mobile task');
  await mobile.getByRole('button', { name: 'Send panel message' }).click();
  await desktop.getByRole('textbox', { name: 'Panel message' }).focus();
  await page.keyboard.press('Escape');
  await expect(
    desktop.getByRole('complementary', { name: 'Supporting task', exact: true }),
  ).toBeHidden();
  await expect(mobile.getByRole('dialog', { name: 'Supporting task', exact: true })).toBeVisible();
  await filter.focus();
  await page.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog', { name: 'Supporting task', exact: true })).toBeVisible();
  await filter.evaluate((node) => node.blur());
  await page.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog', { name: 'Supporting task', exact: true })).toBeVisible();
});

test('Escape after sending closes the last interacted panel while another sample stays editable', {
  tag: '@touch',
}, async ({ page }) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Supporting feed');
  const family = page.locator('[data-kit-comparison="agent-panel"]');
  const desktop = specimen(family, 'desktop');
  const mobile = specimen(family, 'mobile');
  for (const sample of [desktop, mobile])
    await sample.getByRole('button', { name: 'Open agent panel' }).click();
  await desktop.getByRole('textbox', { name: 'Panel message' }).fill('Desktop draft');
  await mobile.getByRole('textbox', { name: 'Panel message' }).fill('Send this thought');
  const send = mobile.getByRole('button', { name: 'Send panel message' });
  await send.click();
  await expect(send).toBeDisabled();
  await expect(mobile.locator('[data-message="user"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog', { name: 'Supporting task', exact: true })).toBeHidden();
  await expect(mobile.getByRole('button', { name: 'Open agent panel' })).toBeFocused();
  await expect(
    desktop.getByRole('complementary', { name: 'Supporting task', exact: true }),
  ).toBeVisible();
  await desktop.getByRole('textbox', { name: 'Panel message' }).fill('Still editable');
  await expect(desktop.getByRole('textbox', { name: 'Panel message' })).toHaveValue(
    'Still editable',
  );
});

test('catalogue suggestions fill and focus their own public TextBox field', async ({ page }) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Feed & composer');
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

test('labelled suggestions select an editable draft by keyboard in both kit layouts', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Text box');
  const family = page.locator('[data-kit-comparison="text-box"]');
  for (const device of ['desktop', 'mobile'] as const) {
    const sample = specimen(family, device);
    const suggestions = sample.getByRole('region', { name: 'Suggested starting points' });
    const choice = suggestions.getByRole('button', { name: 'Make time for a walk', exact: true });
    await choice.focus();
    await choice.press('Enter');
    const field = sample.getByRole('textbox', { name: 'Quick note', exact: true });
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Leave space for a walk before work.');
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(sample.getByRole('status')).toHaveText('Nothing saved yet.');
    const list = (await suggestions.boundingBox())!;
    let bottom = list.y;
    for (const option of await suggestions.getByRole('button').all()) {
      const bounds = (await option.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(bottom);
      expect(bounds.x).toBeCloseTo(list.x, 0);
      expect(bounds.width).toBeCloseTo(list.width, 0);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(
        await option.evaluate((node) => {
          const button = node.getBoundingClientRect();
          const content = document.createRange();
          content.selectNodeContents(node);
          return [...content.getClientRects()].every(
            (part) =>
              part.left >= button.left &&
              part.right <= button.right &&
              part.bottom <= button.bottom,
          );
        }),
      ).toBe(true);
      bottom = bounds.y + bounds.height;
    }
  }
});

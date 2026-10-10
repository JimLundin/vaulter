import { expect, test } from '@playwright/test';

test('navigation has the same destinations and actions in both arrangements', async ({
  page,
}, info) => {
  const compact = info.project.name === 'phone';
  await page.goto('/preview/');
  await expect(page.getByRole('heading', { name: 'What’s on your mind?' })).toBeVisible();
  if (compact) {
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    const footer = page.locator('footer').filter({ has: menu });
    await expect(footer).toHaveText('');
    for (const control of await footer.locator(':scope > button, :scope > a').all()) {
      expect(await control.evaluate((node) => getComputedStyle(node).borderRadius)).toBe('8px');
      expect(await control.getAttribute('aria-label')).toBeTruthy();
    }
    const voice = page.getByRole('button', { name: 'Start voice interaction' });
    const voiceBox = await voice.boundingBox();
    const footerBox = await footer.boundingBox();
    expect(voiceBox!.y + voiceBox!.height).toBeLessThan(footerBox!.y);
    expect(footerBox!.height).toBeLessThanOrEqual(60);
    await menu.click();
    await expect(
      page.getByRole('button', { name: 'Menu', exact: true, includeHidden: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: 'Agent', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(menu).toBeFocused();
  } else {
    const workspace = page.locator('[data-layout="desktop-workspace"]');
    await expect(workspace.locator('footer')).toHaveCount(0);
    const mainBox = (await workspace.locator('main').boundingBox())!;
    const workspaceBox = (await workspace.boundingBox())!;
    expect(mainBox.y + mainBox.height).toBeCloseTo(workspaceBox.y + workspaceBox.height, 0);
    await page.keyboard.press('?');
    await expect(
      page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Agent', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Try a conversation', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Ask the agent', exact: true })).toHaveCount(0);
  }
  const beforeSettings = page.url();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('region', { name: 'Agent', exact: true })).toBeVisible();
  await expect(settings.getByRole('textbox', { name: 'Model', exact: true })).toBeVisible();
  expect(page.url()).toBe(beforeSettings);
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(settings).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  if (compact) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const historyLink = compact
    ? page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'History', exact: true })
    : page.locator('[data-sidebar="menu-button"]').filter({ hasText: 'History' });
  await historyLink.click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  const historyURL = page.url();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  expect(page.url()).toBe(historyURL);
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  // Settings reached through Search uses the same menu and leaves History underneath.
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Search or ask', exact: true })
    .getByRole('combobox')
    .fill('Settings');
  await page.getByRole('option', { name: 'Settings', exact: true }).click();
  await expect(settings).toBeVisible();
  expect(page.url()).toBe(historyURL);
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a direct settings URL opens the same menu and preserves the agent draft', async ({
  page,
}) => {
  await page.goto('/preview/#/settings/');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('textbox', { name: 'Model', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page).toHaveURL(/#\/agent\/$/);
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Keep this message while changing preferences');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(settings).toBeVisible();
  const model = settings.getByRole('textbox', { name: 'Model', exact: true });
  await expect(model).toHaveAccessibleDescription('Used for new messages. Saved on this device.');
  await settings.getByText('Model', { exact: true }).click();
  await expect(model).toBeFocused();
  await model.fill('example-model');
  await page.keyboard.press('Escape');
  await expect(draft).toHaveValue('Keep this message while changing preferences');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(model).toHaveValue('example-model');
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(model).toHaveValue('example-model');
});

test('Appearance group retains keyboard selection and device preference after reopening and reload', async ({
  page,
}) => {
  await page.goto('/preview/#/settings/');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const group = settings.getByRole('radiogroup', { name: 'Theme', exact: true });
  await expect(group).toHaveAccessibleDescription(
    "Choose a theme, or follow your device's appearance.",
  );
  await group.getByRole('radio', { name: 'Light', exact: true }).click();
  const dark = group.getByRole('radio', { name: 'Dark', exact: true });
  // Release the arrow key after focus navigation has happened.
  await page.keyboard.down('ArrowDown');
  await expect(dark).toBeFocused();
  await page.keyboard.up('ArrowDown');
  await expect(dark).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vaulter.theme'))).toBe('dark');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(group.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vaulter.theme'))).toBe('dark');
  await expect(group.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
});

test('every feature page centers the same reading column', async ({ page }) => {
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/preview/', '/preview/#/history/', '/ui/kit/tests/browser.html']) {
      await page.goto(path);
      const main = page.locator('main[data-region]');
      const column = main.locator('[data-reading-column]');
      await expect(column).toBeVisible();
      const parent = (await main.boundingBox())!;
      const child = (await column.boundingBox())!;
      expect(
        Math.abs(child.x + child.width / 2 - (parent.x + parent.width / 2)),
      ).toBeLessThanOrEqual(1);
      expect(child.width).toBeLessThanOrEqual(768);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});

test('the preview field keeps one inset action and its draft through focus and resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(input).toBeVisible();
  await expect(input).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Type a message', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close keyboard', exact: true })).toHaveCount(0);
  await input.evaluate((node) => node.setAttribute('data-original-field', ''));
  await input.click();
  await expect(input).toBeFocused();
  await input.fill('A message I can type directly');
  for (const width of [390, 320, 768, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('data-original-field', '');
    await expect(input).toHaveValue('A message I can type directly');
    const row = page.locator('[data-conversation-input]');
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(64);
    if (width < 768) {
      const action = page.getByRole('button', { name: 'Send', exact: true });
      await expect(action).toHaveCount(1);
      const field = (await page.getByRole('group', { name: 'Message composer' }).boundingBox())!;
      const voice = (await action.boundingBox())!;
      expect(voice.x).toBeGreaterThan(field.x);
      expect(voice.x + voice.width).toBeLessThan(field.x + field.width);
      expect(Math.abs(field.y + field.height / 2 - voice.y - voice.height / 2)).toBeLessThanOrEqual(
        1,
      );
      expect(voice.x + voice.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('');
});

test('button hit targets resize without animating their geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 844 });
  await page.goto('/preview/');
  const add = page.getByRole('button', { name: 'New chat', exact: true });
  await expect(add).toHaveAttribute('data-size', 'compact');
  // Slow feedback transitions so a layout transition cannot finish before the measurement.
  await add.evaluate((node) => {
    node.style.transitionDuration = '1s';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(add).toHaveAttribute('data-size', 'standard');
  await expect(add).toHaveAttribute('data-icon-only', 'true');
  const bounds = (await add.boundingBox())!;
  expect(bounds.width).toBe(44);
  expect(bounds.height).toBe(44);
  expect(
    await add.evaluate((node) =>
      node.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty),
    ),
  ).toEqual([]);
});

test('agent controls have even insets and suggestions remain one scrolling row with edge fades', async ({
  page,
}) => {
  await page.goto('/preview/');
  for (const width of [1440, 390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const field = page.locator('[data-slot="input-group"]');
    const bounds = (await field.boundingBox())!;
    const mic = page.getByRole('button', { name: 'Start voice interaction', exact: true });
    const send = (await mic.boundingBox())!;
    expect(send.y - bounds.y).toBeCloseTo(bounds.y + bounds.height - send.y - send.height, 0);
    expect(send.x + send.width).toBeCloseTo(bounds.x + bounds.width - (send.y - bounds.y), 0);
    await expect(mic).toHaveCount(1);
    await expect(mic).toHaveAttribute('data-variant', 'filled');
    await expect(mic).toHaveCSS('border-width', '0px');
    expect((await mic.boundingBox())!.height).toBe(send.height);
    if (width < 768) {
      const add = page.getByRole('button', { name: 'New chat', exact: true });
      expect((await add.boundingBox())!.height).toBe(44);
      const toolbar = page.locator('header').filter({ has: add });
      const bar = (await toolbar.boundingBox())!;
      const action = (await add.boundingBox())!;
      expect(action.y - bar.y).toBeGreaterThanOrEqual(4);
      expect(bar.y + bar.height - action.y - action.height).toBeGreaterThanOrEqual(4);
    }
    await expect(page.getByText('Ideas to explore', { exact: true })).toHaveCount(0);
    const strip = page.getByRole('region', { name: 'Suggested prompts' });
    const buttons = strip.getByRole('button');
    const first = (await buttons.first().boundingBox())!;
    for (const button of await buttons.all()) {
      expect((await button.boundingBox())!.y).toBe(first.y);
      await expect(button).toHaveCSS('white-space', 'nowrap');
    }
    const viewport = strip.locator('[data-slot="scroll-area-viewport"]');
    const scrolling = strip.locator('.kit-option-strip');
    await expect(scrolling).toHaveAttribute('data-overflow-end', 'true');
    await expect(scrolling).toHaveAttribute('data-overflow-start', 'false');
    expect(await viewport.evaluate((node) => getComputedStyle(node).maskImage)).toContain(
      'gradient',
    );
    await viewport.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await expect(scrolling).toHaveAttribute('data-overflow-start', 'true');
    await expect(scrolling).toHaveAttribute('data-overflow-end', 'false');
    await viewport.evaluate((node) => {
      node.scrollLeft = 0;
    });
  }
});

test('settings is a shared drawer that keeps feature fields and focus when resized', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const field = settings.getByRole('textbox', { name: 'Calendar preference' });
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
  await expect(settings.getByRole('region', { name: 'Calendar', exact: true })).toBeVisible();
  await field.fill('Keep this draft');
  await field.evaluate((node) => {
    node.setAttribute('data-original-field', '');
  });
  for (const width of [390, 768, 320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(field).toHaveValue('Keep this draft');
    await expect(field).toHaveAttribute('data-original-field', '');
    await expect(field).toBeFocused();
    await expect(settings).toHaveCSS('border-top-left-radius', width < 768 ? '10px' : '12px');
    // Wait for the drawer's opening transition before comparing the visible surface.
    await expect
      .poll(async () => {
        const box = (await settings.boundingBox())!;
        return Math.abs(width < 768 ? box.y + box.height - 844 : box.y + box.height / 2 - 422);
      })
      .toBeLessThan(0.5);
    await page.keyboard.press('Tab');
    await expect
      .poll(() => settings.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
    await field.focus();
  }
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(field).toHaveValue('Keep this draft');
});

test('touch controls grow on phones and touch desktops while retaining keyboard behavior', async ({
  page,
}, info) => {
  await page.goto('/ui/kit/tests/browser.html');
  const compact = page.getByRole('button', { name: 'Small button' });
  const icon = page.getByRole('button', { name: 'Small icon' });
  const grouped = page.getByRole('button', { name: 'Go', exact: true });
  await expect(compact).toBeVisible();
  const compactBox = (await compact.boundingBox())!;
  const iconBox = (await icon.boundingBox())!;
  expect(compactBox.height).toBe(info.project.name === 'desktop' ? 32 : 44);
  expect((await grouped.boundingBox())!.height).toBe(compactBox.height);
  expect(iconBox.width).toBe(compactBox.height);
  expect(iconBox.height).toBe(compactBox.height);
  await expect(icon).toHaveCSS('border-radius', '8px');
  expect(
    (await page.getByRole('button', { name: 'Open agent', exact: true }).boundingBox())!.height,
  ).toBe(44);
  const slots = [
    'button',
    'checkbox',
    'input',
    'input-group',
    'input-group-control',
    'tabs-trigger',
    'toggle-group-item',
  ];
  if (info.project.name !== 'desktop') {
    for (const mark of await page
      .getByRole('figure', { name: 'Long series' })
      .getByRole('button')
      .all()) {
      expect((await mark.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }
    for (const slot of slots) {
      const controls = page.locator(`[data-slot="${slot}"]:visible`);
      expect(await controls.count(), slot).toBeGreaterThan(0);
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        expect(box!.height, slot).toBeGreaterThanOrEqual(44);
        expect(box!.width, slot).toBeGreaterThanOrEqual(44);
      }
    }
    expect(
      await page.getByRole('checkbox').evaluate((node) => getComputedStyle(node, '::before').width),
    ).toBe('16px');
    expect(
      await page
        .getByRole('textbox', { name: 'Preference' })
        .evaluate((node) => getComputedStyle(node).fontSize),
    ).toBe('16px');
  }
  await page.getByRole('checkbox').click();
  await expect(page.getByRole('checkbox')).toBeChecked();
  await page.getByRole('checkbox').press('Space');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('tab', { name: 'First', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Second', exact: true })).toBeFocused();
  await expect(page.getByText('Second tab content', { exact: true })).toBeVisible();
  if (info.project.name !== 'desktop') {
    for (const control of await page.getByRole('radio').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole('button', { name: 'More controls' }).click();
  const item = page.getByRole('menuitem', { name: 'Menu item' });
  if (info.project.name !== 'desktop')
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'More controls' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('search keeps its query, selected result and focus through every size threshold', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('Result');
  await page.keyboard.press('ArrowDown');
  const selected = await input.getAttribute('aria-activedescendant');
  for (const width of [767, 768, 1279, 1280, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(input).toHaveValue('Result');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-activedescendant', selected!);
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close search' })).toBeVisible();
  expect(
    await page.getByRole('dialog').evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeFocused();
});

test('settings fields and open review drafts keep their DOM state when rearranged', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html');
  const preference = page.getByRole('textbox', { name: 'Preference' });
  await preference.fill('Edited preference');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preference).toHaveValue('Edited preference');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(preference).toHaveValue('Edited preference');
  await page.getByRole('button', { name: 'Open review' }).click();
  const input = page.getByRole('textbox', { name: 'Review draft' });
  await input.fill('An edited review');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(input).toHaveValue('An edited review');
    await expect(input).toBeFocused();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open review' })).toBeFocused();
});

test('agent panel preserves its draft while becoming modal, and traps focus only when modal', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html');
  await page.getByRole('button', { name: 'Open agent' }).click();
  const draft = page.getByRole('textbox', { name: 'Panel draft' });
  await draft.fill('A preserved agent draft');
  for (const width of [1280, 1279, 767, 768, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(draft).toHaveValue('A preserved agent draft');
    await expect(draft).toBeFocused();
    const surface = page.getByRole(width >= 1280 ? 'complementary' : 'dialog', { name: 'Agent' });
    await expect(surface).toBeVisible();
    if (width < 1280) {
      await page.keyboard.press('Tab');
      expect(await surface.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      await draft.focus();
    } else {
      const background = page.getByRole('textbox', { name: 'Preference' });
      await background.focus();
      await expect(background).toBeFocused();
      await draft.focus();
    }
  }
  await page.keyboard.press('Escape');
  await expect(draft).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open agent' })).toBeFocused();
});

test('a growing navigation keeps overflow actions available without making the footer grow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/ui/kit/tests/browser.html');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const footer = page.locator('footer').filter({ has: menu });
  await expect(footer.locator(':scope > button, :scope > a')).toHaveCount(5);
  await menu.click();
  await expect(page.getByRole('link', { name: 'Extra', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(menu).toBeFocused();
  await menu.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Extra', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeHidden();
});

test('Enter sends, Shift+Enter and IME keep editing, and suggestions live outside the composer', async ({
  page,
}) => {
  await page.goto('/preview/');
  const suggestion = page.getByRole('button', {
    name: 'How could I make more room for slow mornings?',
    exact: true,
  });
  await expect(suggestion).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Message composer' })
      .getByRole('button', { name: 'How could I make more room for slow mornings?', exact: true }),
  ).toHaveCount(0);
  await suggestion.click();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('rows', '1');
  const composer = page.getByRole('group', { name: 'Message composer' });
  expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect((await input.boundingBox())!.height).toBe(44);
  await input.fill('   ');
  await input.press('Enter');
  await expect(input).toHaveValue('   \n');
  await expect(page.locator('[data-message="user"]')).toHaveCount(0);
  await input.fill('First line');
  await input.press('End');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('First line\n');
  expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(56);
  await input.fill('Composing');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await expect(input).toHaveValue('Composing');
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
  await expect(input).toHaveValue('Composing');
  await input.fill('Tell me about slow mornings');
  await input.press('Enter');
  await expect(page.locator('[data-message="user"]')).toContainText('Tell me about slow mornings');
  await expect(input).toHaveValue('');
  await expect(page.getByText('Your sample vault has notes about', { exact: false })).toBeVisible();
});

test('the composer and search stay within the visual viewport when a keyboard opens', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { value: 844, writable: true },
      offsetTop: { value: 0, writable: true },
    });
    Object.defineProperty(globalThis, 'visualViewport', { value: viewport });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keyboard draft');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { value: 440, writable: true });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  await expect
    .poll(async () => {
      const workspace = (await page.locator('[data-layout="mobile-workspace"]').boundingBox())!;
      return Math.abs(workspace.height - (440 - (await banner.boundingBox())!.height));
    })
    .toBeLessThanOrEqual(1);
  const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(440);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect
    .poll(async () => {
      const search = (await page.getByRole('dialog').boundingBox())!;
      return Math.abs(search.height - (440 - (await banner.boundingBox())!.height));
    })
    .toBeLessThanOrEqual(1);
  await expect(
    page.getByRole('dialog', { name: 'Search or ask', exact: true }).getByRole('combobox'),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Close search' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('textbox', { name: 'Model', exact: true }).fill('Keyboard preference');
  await expect
    .poll(async () => {
      const box = (await settings.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(441);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { value: 340, writable: true });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { value: 20, writable: true });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect
    .poll(async () => {
      const available = 340 - (await banner.boundingBox())!.height;
      const maxHeight = await settings.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).maxHeight),
      );
      return Math.abs(maxHeight - Math.min(available * 0.8, available - 16));
    })
    .toBeLessThanOrEqual(1);
  // The drawer transitions the surface; compare its final position with a subpixel allowance.
  await expect
    .poll(async () => {
      const box = (await settings.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(361);
  const sheet = (await settings.boundingBox())!;
  expect(sheet.y).toBeGreaterThanOrEqual(20);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(361);
});

test('Escape closes the nested review before closing the agent panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/tests/browser.html');
  await page.getByRole('button', { name: 'Open agent' }).click();
  await page.getByRole('button', { name: 'Review in panel' }).click();
  await expect(page.getByRole('dialog', { name: 'Review', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Review', exact: true })).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Agent', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review in panel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Agent', exact: true })).toBeHidden();
});

test('dictation keeps the composer anchored and only submission stops an agent response', async ({
  page,
}) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('A typed introduction.');
  const composer = page.getByRole('group', { name: 'Message composer' });
  const before = (await composer.boundingBox())!;
  await input.blur();
  await page.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(input).toHaveValue(/^A typed introduction\. Leave/);
  const listening = (await composer.boundingBox())!;
  expect(listening.y).toBe(before.y);
  expect(listening.height).toBe(before.height);
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await expect(input).toBeEditable();
  expect((await composer.boundingBox())!.y).toBe(before.y);
  await input.focus();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await expect(stop).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop agent', exact: true })).toHaveCount(0);
  const microphone = page.getByRole('button', { name: 'Start voice interaction' });
  await expect(microphone).toBeHidden();
  await expect(composer.getByRole('button')).toHaveCount(1);
  const submitted = await page.locator('[data-message="user"]').count();
  await input.dispatchEvent('keydown', { key: 'Enter', bubbles: true });
  await expect(stop).toBeVisible();
  await expect(input).toBeDisabled();
  await expect(page.locator('[data-message="user"]')).toHaveCount(submitted);
  expect((await composer.boundingBox())!.y).toBe(before.y);
  await stop.click();
  await expect(input).toBeEditable();
  await expect(microphone).toBeEnabled();
  expect((await composer.boundingBox())!.y).toBe(before.y);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Suggested prompts' })).toBeVisible();
  const empty = (await composer.boundingBox())!;
  await microphone.click();
  await expect(input).toHaveValue(/^Leave/);
  expect((await composer.boundingBox())!.y).toBe(empty.y);
  await page.getByRole('button', { name: 'Finish recording' }).click();
});

test('the send icon reflects text field focus without a keyboard hint below the composer', async ({
  page,
}) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const send = page.getByRole('button', { name: 'Send', exact: true });
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeVisible();
  await expect(send).toBeHidden();
  await input.fill('A typed thought');
  await expect(send.locator('svg')).toHaveClass(/lucide-corner-down-left/);
  await page.getByRole('button', { name: 'New chat', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeVisible();
  await expect(send).toBeHidden();
  await expect(
    page.getByText('Enter to send · Shift + Enter for a new line', { exact: true }),
  ).toHaveCount(0);
});

test('live transcription updates the shared message field and uses the normal send path', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('A typed introduction.');
  await input.blur();
  await page.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(input).toHaveValue(/^A typed introduction\. Leave/);
  await expect(input).not.toBeFocused();
  await expect(input).toHaveAttribute('readonly');
  expect((await input.boundingBox())!.height).toBe(44);
  await expect
    .poll(() => input.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThanOrEqual(1);
  await expect(page.locator('[data-message="user"]')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(input).toHaveValue(/^A typed introduction\. Leave space/);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await expect(input).toBeEditable();
  const text = await input.inputValue();
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Live transcription' })).toHaveCount(0);
  await input.fill(`${text} Edited before sending.`);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(input).toHaveValue(/Edited before sending\. Leave/);
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await expect(input).toBeEditable();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const final = await input.inputValue();
  await input.press('Enter');
  await expect(page.locator('[data-message="user"] [data-surface="bubble"]')).toHaveText(final);
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeHidden();
  await expect(input).toBeEditable();
  await page.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(input).toHaveValue(/^Leave/);
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await expect(input).toBeEditable();
  const second = await input.inputValue();
  await input.focus();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('[data-message="user"] [data-surface="bubble"]')).toHaveText([
    final,
    second,
  ]);
  await expect(input).toHaveValue('');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('Chat retains the shared draft when its view closes and reopens', async ({ page }) => {
  await page.goto('/preview/');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('An unfinished workflow thought');
  const navigationMenu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await navigationMenu.isVisible()) await navigationMenu.click();
  await page.getByRole('link', { name: 'History', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: 'Agent', exact: true }).click();
  await expect(field).toHaveValue('An unfinished workflow thought');
  await field.press('Enter');
  await expect(page.locator('[data-message="user"] [data-surface="bubble"]')).toHaveText(
    'An unfinished workflow thought',
  );
});

test('Enter and Send both open staged-change review and cancellation keeps the workflow draft', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/preview/?legacy-staging');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(field).toBeEditable();
  const submitted = await page.locator('[data-message="user"]').count();
  const review = page.getByRole('dialog', { name: 'Review pending changes', exact: true });
  for (const method of ['Enter', 'Send']) {
    await field.fill(`Keep this ${method} draft pending review`);
    if (method === 'Enter') await field.press('Enter');
    else await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(review).toBeVisible();
    await expect(review.getByText('Legacy draft.md', { exact: false })).toBeVisible();
    await expect(field).toHaveValue(`Keep this ${method} draft pending review`);
    await expect(page.locator('[data-message="user"]')).toHaveCount(submitted);
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(review).toBeHidden();
    await expect(field).toHaveValue(`Keep this ${method} draft pending review`);
  }
  await field.press('Enter');
  await review.getByRole('button', { name: 'Send and keep staged edits' }).click();
  await expect(page.locator('[data-message="user"]')).toHaveCount(submitted + 1);
  await expect(field).toHaveValue('');
});

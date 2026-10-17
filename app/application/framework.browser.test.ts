import {
  openAppAction,
  expectAppActionFocus,
  navigateToModule,
} from '../ui/kit/navigation.browser.test-support.ts';
import { expect, test } from '@playwright/test';

test(
  'navigation has the same destinations and actions in both arrangements',
  { tag: '@phone' },
  async ({ page }, info) => {
    const compact = info.project.name === 'phone';
    await page.goto('/preview/');
    await expect(page.getByRole('heading', { name: 'What’s on your mind?' })).toBeVisible();
    if (compact) {
      const menu = page.getByRole('button', { name: 'Modules', exact: true });
      const rail = page.getByRole('navigation', { name: 'App controls', exact: true });
      await expect(rail.getByRole('button')).toHaveCount(1);
      for (const control of await rail.getByRole('button').all()) {
        expect((await control.boundingBox())!.width).toBe(44);
        expect((await control.boundingBox())!.height).toBe(44);
        expect(await control.getAttribute('aria-label')).toBeTruthy();
      }
      const voice = page.getByRole('button', { name: 'Start voice interaction' });
      const voiceBox = await voice.boundingBox();
      const railBox = (await rail.boundingBox())!;
      expect(voiceBox!.x + voiceBox!.width).toBeLessThan(railBox.x);
      expect(railBox.y + railBox.height).toBe(832);
      await expect(page.locator('[data-layout="mobile-workspace"] > footer')).toHaveCount(0);
      await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('menuitem', { name: 'Chat', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
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
      await expect(page.getByRole('link', { name: 'Chat', exact: true })).toHaveCount(1);
      await expect(
        page.getByRole('button', { name: 'Try a conversation', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Ask the agent', exact: true })).toHaveCount(0);
    }
    const beforeSettings = page.url();
    await openAppAction(page, 'Settings');
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('region', { name: 'Chat', exact: true })).toBeVisible();
    await expect(settings.getByRole('combobox', { name: 'Model', exact: true })).toBeVisible();
    expect(page.url()).toBe(beforeSettings);
    if (!compact)
      await expect(
        page.getByRole('button', { name: 'Settings', exact: true, includeHidden: true }),
      ).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(settings).toBeHidden();
    await expectAppActionFocus(page, 'Settings');
    await navigateToModule(page, 'History');
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
    const historyURL = page.url();
    await openAppAction(page, 'Settings');
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    expect(page.url()).toBe(historyURL);
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
    // Settings reached through Search uses the same menu and leaves History underneath.
    await openAppAction(page, 'Search');
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
    await expectAppActionFocus(page, 'Search');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  },
);

test('a direct settings URL opens the same menu and preserves the agent draft', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/settings/');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('combobox', { name: 'Model', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page).toHaveURL(/#\/chat\/$/);
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Keep this message while changing preferences');
  await openAppAction(page, 'Settings');
  await expect(settings).toBeVisible();
  const model = settings.getByRole('combobox', { name: 'Model', exact: true });
  await expect(model).toHaveAccessibleDescription('Used for new messages. Saved on this device.');
  await settings.getByText('Model', { exact: true }).click();
  await expect(model).toBeFocused();
  await model.selectOption({ label: 'Custom…' });
  const customModel = settings.getByRole('textbox', { name: 'Custom model', exact: true });
  await customModel.fill('example-model');
  await page.keyboard.press('Escape');
  await expect(draft).toHaveValue('Keep this message while changing preferences');
  await openAppAction(page, 'Settings');
  await expect(model.locator('option:checked')).toHaveText('Custom…');
  await expect(customModel).toHaveValue('example-model');
  await page.reload();
  await openAppAction(page, 'Settings');
  await expect(model.locator('option:checked')).toHaveText('Custom…');
  await expect(customModel).toHaveValue('example-model');
});

test('Appearance group retains keyboard selection and device preference after reopening and reload', {
  tag: '@phone',
}, async ({ page }) => {
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
  await openAppAction(page, 'Settings');
  await expect(group.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.reload();
  await openAppAction(page, 'Settings');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vaulter.theme'))).toBe('dark');
  await expect(group.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
});

test('every feature page centers the same reading column', async ({ page }) => {
  for (const path of ['/preview/', '/preview/#/history/', '/ui/kit/tests/browser.html']) {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(path);
    for (const width of [390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const main = page.locator('main[data-region]');
      const column = main.locator('[data-reading-column]');
      await expect(column).toBeVisible();
      await expect
        .poll(async () => {
          const parent = (await (path === '/preview/'
            ? column.locator('..')
            : main
          ).boundingBox())!;
          const child = (await column.boundingBox())!;
          return Math.abs(child.x + child.width / 2 - (parent.x + parent.width / 2));
        })
        .toBeLessThanOrEqual(1);
      const child = (await column.boundingBox())!;
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
      const field = (await page.getByRole('group', { name: 'Message text box' }).boundingBox())!;
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
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(0);
  await expect(input).toHaveValue('A message I can type directly');
});

test('agent controls have even insets and every suggested prompt is visible without sideways scrolling', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
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
    await expect(page.getByText('Ideas to explore', { exact: true })).toHaveCount(0);
    const suggestions = page.getByRole('region', { name: 'Suggested prompts' });
    const buttons = suggestions.getByRole('button');
    await expect(buttons).toHaveCount(3);
    for (const button of await buttons.all()) {
      await expect(button).toBeInViewport();
    }
    expect(await suggestions.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
});

test('settings is a shared drawer that keeps feature fields and focus when resized', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html');
  await openAppAction(page, 'Settings');
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
  await expectAppActionFocus(page, 'Settings');
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppAction(page, 'Settings');
  await expect(field).toHaveValue('Keep this draft');
});

test(
  'shared controls retain mouse and touch target sizes',
  { tag: ['@phone', '@touch'] },
  async ({ page }, info) => {
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
    const primary = page.getByRole('button', {
      name: info.project.name === 'phone' ? 'Modules' : 'Open agent',
      exact: true,
    });
    expect((await primary.boundingBox())!.height).toBe(44);
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
        await page
          .getByRole('checkbox')
          .evaluate((node) => getComputedStyle(node, '::before').width),
      ).toBe('16px');
      expect(
        await page
          .getByRole('textbox', { name: 'Preference' })
          .evaluate((node) => getComputedStyle(node).fontSize),
      ).toBe('16px');
    }
    if (info.project.name !== 'desktop') {
      for (const control of await page.getByRole('radio').all()) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.getByRole('button', { name: 'More controls' }).click();
    const item = page.getByRole('menuitem', { name: 'Menu item' });
    await expect(item).toBeVisible();
    if (info.project.name !== 'desktop')
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  },
);

test('search keeps its query, selected result and focus through every size threshold', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html');
  await openAppAction(page, 'Search');
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
  await expectAppActionFocus(page, 'Search');
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
  await openAppAction(page, 'Open agent');
  const draft = page.getByRole('textbox', { name: 'Panel draft' });
  await draft.fill('A preserved agent draft');
  for (const width of [1280, 1279, 767, 768, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(draft).toHaveValue('A preserved agent draft');
    await expect(draft).toBeFocused();
    const surface = page.getByRole(width >= 768 ? 'complementary' : 'dialog', { name: 'Chat' });
    await expect(surface).toBeVisible();
    if (width < 768) {
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
  await expect(page.getByRole('textbox', { name: 'Preference' })).toBeFocused();
});

test('a growing navigation keeps destinations and tools in a minimal rail menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/ui/kit/tests/browser.html');
  const menu = page.getByRole('button', { name: 'Modules', exact: true });
  const rail = page.getByRole('navigation', { name: 'App controls', exact: true });
  await expect(rail.getByRole('button')).toHaveCount(1);
  await menu.click();
  await expect(page.getByRole('menuitem', { name: 'Extra', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Help', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('menu', { name: 'App navigation', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Agent', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('menu', { name: 'App navigation', exact: true })).toBeHidden();
});

test('suggestions focus the shared composer and Enter submits through Chat', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const suggestion = page.getByRole('button', {
    name: 'How could I make more room for slow mornings?',
    exact: true,
  });
  await expect(suggestion).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Message text box' })
      .getByRole('button', { name: 'How could I make more room for slow mornings?', exact: true }),
  ).toHaveCount(0);
  await suggestion.click();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('rows', '1');
  const composer = page.getByRole('group', { name: 'Message text box' });
  expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect((await input.boundingBox())!.height).toBe(44);
  await input.fill('Tell me about slow mornings');
  await input.press('Enter');
  await expect(page.locator('[data-message="user"]')).toContainText('Tell me about slow mornings');
  await expect(input).toHaveValue('');
  await expect(page.getByText('Your sample vault has notes about', { exact: false })).toBeVisible();
});

test('the composer and search stay within the visual viewport when a keyboard opens', {
  tag: '@phone',
}, async ({ page }) => {
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
  const frame = page.locator('[data-design-viewport]');
  await expect
    .poll(async () => {
      const workspace = (await page.locator('[data-layout="mobile-workspace"]').boundingBox())!;
      return Math.abs(workspace.height - (await frame.boundingBox())!.height);
    })
    .toBeLessThanOrEqual(1);
  const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(440);
  await openAppAction(page, 'Search');
  await expect
    .poll(async () => {
      const search = (await page.getByRole('dialog').boundingBox())!;
      return Math.abs(search.height - (await frame.boundingBox())!.height);
    })
    .toBeLessThanOrEqual(1);
  await expect(
    page.getByRole('dialog', { name: 'Search or ask', exact: true }).getByRole('combobox'),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Close search' }).click();
  await openAppAction(page, 'Settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings
    .getByRole('combobox', { name: 'Model', exact: true })
    .selectOption({ label: 'Custom…' });
  await settings
    .getByRole('textbox', { name: 'Custom model', exact: true })
    .fill('Keyboard preference');
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
      const available = (await frame.boundingBox())!.height;
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
  await openAppAction(page, 'Open agent');
  await page.getByRole('button', { name: 'Review in panel' }).click();
  await expect(page.getByRole('dialog', { name: 'Review', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Review', exact: true })).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Chat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review in panel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Chat', exact: true })).toBeHidden();
});

test('dictation keeps the composer anchored and only submission stops an agent response', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('A typed introduction.');
  const composer = page.getByRole('group', { name: 'Message text box' });
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
  await input.fill(`slow response: ${await input.inputValue()}`);
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
  await input.fill('');
  await input.blur();
  const empty = (await composer.boundingBox())!;
  await microphone.click();
  await expect(input).toHaveValue(/^Leave/);
  expect((await composer.boundingBox())!.y).toBe(empty.y);
  await page.getByRole('button', { name: 'Finish recording' }).click();
});

test('live transcription updates the shared message field and uses the normal send path', {
  tag: '@phone',
}, async ({ page, baseURL }) => {
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
  await navigateToModule(page, 'History');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await openAppAction(page, 'Start voice interaction');
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

test('Chat retains the shared draft when its view closes and reopens', { tag: '@phone' }, async ({
  page,
}) => {
  await page.goto('/preview/');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('An unfinished workflow thought');
  await navigateToModule(page, 'History');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await navigateToModule(page, 'Chat');
  await expect(field).toHaveValue('An unfinished workflow thought');
  await field.press('Enter');
  await expect(page.locator('[data-message="user"] [data-surface="bubble"]')).toHaveText(
    'An unfinished workflow thought',
  );
});

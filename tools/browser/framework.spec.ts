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
      expect(await control.evaluate((node) => getComputedStyle(node).borderRadius)).toBe('0px');
      expect(await control.getAttribute('aria-label')).toBeTruthy();
    }
    const voice = footer.getByRole('button', { name: 'Start voice interaction' });
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
  }
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  if (compact) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('touch controls grow on phones and touch desktops while retaining keyboard behavior', async ({
  page,
}, info) => {
  await page.goto('/ui/kit/tests/browser.html');
  await expect(page.getByRole('button', { name: 'Small button' })).toBeVisible();
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
}, info) => {
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
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'Close keyboard' }).click();
    await expect(input).toBeHidden();
    await page.getByRole('button', { name: 'Type a message' }).click();
    await expect(input).toHaveValue('How could I make more room for slow mornings?');
  }
  await input.fill('   ');
  await input.press('Enter');
  await expect(input).toHaveValue('   ');
  await input.fill('First line');
  await input.press('End');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('First line\n');
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
  await page.getByRole('button', { name: 'Type a message' }).click();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keyboard draft');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { value: 440, writable: true });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('[data-layout="mobile-workspace"]')).toHaveCSS('height', '440px');
  const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(440);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('height', '440px');
  await expect(page.getByRole('combobox')).toBeFocused();
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

test('live transcription survives rearrangement and remains separate from the keyboard draft', async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4179') external.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/preview/');
  await page.getByRole('button', { name: 'Start voice interaction' }).click();
  const transcript = page.getByRole('region', { name: 'Live transcription' });
  await expect(transcript).toContainText('Leave');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(transcript).toContainText('Leave space');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await expect(transcript).toContainText('Ready to send');
  const text = await transcript.locator('[aria-live]').innerText();
  await page.getByRole('button', { name: 'Edit text' }).click();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(input).toHaveValue(text);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(input).toHaveValue(text);
  await expect(input).toBeFocused();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

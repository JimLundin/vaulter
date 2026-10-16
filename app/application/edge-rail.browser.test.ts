import { expect, test } from '@playwright/test';
import { navigateToModule } from '../ui/kit/navigation.browser.test-support.ts';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports these browser types.
import type { Locator, Page } from '@playwright/test';

async function expectHitTarget(control: Locator) {
  await expect(control).toBeVisible();
  await expect
    .poll(() =>
      control.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return target === node || node.contains(target);
      }),
    )
    .toBe(true);
}

async function expectInputLane(page: Page, label: string) {
  await expect
    .poll(async () => {
      const entry = (await page
        .getByRole('group', { name: `${label} text box`, exact: true })
        .boundingBox())!;
      const rail = (await page.locator('[data-edge-rail]').boundingBox())!;
      return entry.x + entry.width <= rail.x - 11;
    })
    .toBe(true);
}

async function expectAnchor(page: Page, count: number) {
  const rail = page.locator('[data-edge-rail]');
  await expect(rail.getByRole('button')).toHaveCount(count);
  await expect
    .poll(async () => {
      const viewport = (await page.locator('[data-design-viewport]').boundingBox())!;
      const bounds = (await rail.boundingBox())!;
      return Math.max(
        Math.abs(bounds.x + bounds.width - (viewport.x + viewport.width - 12)),
        Math.abs(bounds.y + bounds.height - (viewport.y + viewport.height - 12)),
      );
    })
    .toBeLessThanOrEqual(1);
  const modules = (await rail.getByRole('button', { name: 'Modules', exact: true }).boundingBox())!;
  const viewport = (await page.locator('[data-design-viewport]').boundingBox())!;
  expect(modules.y + modules.height).toBeCloseTo(viewport.y + viewport.height - 16, 0);
  for (const button of await rail.getByRole('button').all()) {
    const target = (await button.boundingBox())!;
    expect(target.width).toBe(44);
    expect(target.height).toBe(44);
  }
  return rail;
}

async function setKeyboardViewport(page: Page, height: number, top: number) {
  // Playwright does not open a native keyboard. Exercise its visible viewport resize and pan.
  await page.evaluate(
    ({ height, top }) => {
      Object.defineProperties(window.visualViewport!, {
        height: { configurable: true, get: () => height },
        offsetTop: { configurable: true, get: () => top },
      });
      window.visualViewport!.dispatchEvent(new Event('resize'));
      window.visualViewport!.dispatchEvent(new Event('scroll'));
    },
    { height, top },
  );
  await expect
    .poll(async () => (await page.locator('[data-design-viewport]').boundingBox())!.height)
    .toBe(height);
}

test('the freestanding rail follows the keyboard viewport and leaves Chat controls in a left lane', {
  tag: '@phone',
}, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/preview/?conversations');
  const message = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(message).not.toBeFocused();
  await expectInputLane(page, 'Message');
  await expectHitTarget(page.getByRole('button', { name: 'Start voice interaction', exact: true }));
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await message.fill('Keep this draft beside the rail');
    for (const [height, top] of [
      [844, 0],
      [430, 72],
      [340, 100],
    ]) {
      await message.focus();
      await setKeyboardViewport(page, height, top);
      const rail = await expectAnchor(page, 3);
      const bounds = (await rail.boundingBox())!;
      const input = (await page.getByRole('group', { name: 'Message text box' }).boundingBox())!;
      expect(input.x + input.width).toBeLessThanOrEqual(bounds.x - 11);
      await expectHitTarget(page.getByRole('button', { name: 'Send', exact: true }));
      await expect(message).toBeFocused();
      await expect(message).toHaveValue('Keep this draft beside the rail');
      await expect(page.locator('[data-dock]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await message.blur();
      await expectInputLane(page, 'Message');
      await expectHitTarget(
        page.getByRole('button', { name: 'Start voice interaction', exact: true }),
      );
    }
    await setKeyboardViewport(page, 844, 0);
  }
  await page.getByRole('button', { name: 'Start voice interaction', exact: true }).click();
  await expect(message).toHaveValue(/^Keep this draft beside the rail Leave/);
  await setKeyboardViewport(page, 430, 72);
  await expectInputLane(page, 'Message');
  const finish = page.getByRole('button', { name: 'Finish recording', exact: true });
  await expectHitTarget(finish);
  await expect(message).not.toBeFocused();
  await finish.click();
  await setKeyboardViewport(page, 844, 0);
  await message.fill('Keep this draft beside the rail');
  const conversations = page.getByRole('button', { name: 'Conversations', exact: true });
  await conversations.click();
  const chooser = page.getByRole('dialog', { name: 'Conversations', exact: true });
  await expect(chooser.getByRole('button', { name: /Garden studio plans/ })).toBeVisible();
  await chooser.getByRole('button', { name: 'Close conversations', exact: true }).click();
  await expect(conversations).toBeFocused();
  await navigateToModule(page, 'History');
  await expectAnchor(page, 1);
  await navigateToModule(page, 'Chat');
  await expectAnchor(page, 3);
  await expect(message).toHaveValue('Keep this draft beside the rail');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('[data-edge-rail]')).toHaveCount(0);
  await expect(page.locator('[data-edge-input-lane]')).toHaveCount(0);
  await expect(message).toHaveValue('Keep this draft beside the rail');
  await expect(
    page
      .locator('[data-slot="sidebar-header"]')
      .getByRole('button', { name: 'Settings', exact: true }),
  ).toBeVisible();
});

test('Questions search and filters share the rail while trailing Save stays reachable', {
  tag: '@phone',
}, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/preview/#/questions/');
  await expectAnchor(page, 3);
  await expectInputLane(page, 'Your answer');
  const trigger = page.getByRole('button', { name: 'Find questions', exact: true });
  const field = page.getByRole('searchbox', { name: 'Find questions', exact: true });
  await expect(field).toHaveCount(0);
  await trigger.click();
  await expect(field).toBeFocused();
  await field.fill('no matching question');
  await expect(page.getByText('No questions found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  const menu = page.getByRole('menu', { name: 'Page filters', exact: true });
  for (const status of ['Answered', 'Abandoned', 'All', 'Open']) {
    await filters.click();
    await expect(menu).toBeVisible();
    for (const choice of await menu.getByRole('menuitemradio').all()) await expectHitTarget(choice);
    await menu.getByRole('menuitemradio', { name: status, exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(filters).toBeFocused();
    if (status === 'All') await expect(filters).not.toHaveAttribute('data-filtered', 'true');
    else await expect(filters).toHaveAttribute('data-filtered', 'true');
  }
  await field.fill('Garden studio');
  await setKeyboardViewport(page, 340, 100);
  await expectAnchor(page, 3);
  await filters.click();
  await expect(menu).toBeVisible();
  const viewport = (await page.locator('[data-design-viewport]').boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.y).toBeGreaterThanOrEqual(viewport.y - 1);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
  for (const choice of await menu.getByRole('menuitemradio').all()) await expectHitTarget(choice);
  await page.keyboard.press('Escape');
  await expect(filters).toBeFocused();
  await expect(field).toHaveValue('Garden studio');
  await setKeyboardViewport(page, 844, 0);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('Leave the bench clear.');
  await page.getByRole('textbox', { name: 'Your answer', exact: true }).blur();
  await expectInputLane(page, 'Your answer');
  await page.locator('main').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expectHitTarget(
    page
      .getByRole('group', { name: 'Your answer text box', exact: true })
      .getByRole('button', { name: 'Start voice interaction', exact: true }),
  );
  await page.getByRole('textbox', { name: 'Your answer', exact: true }).focus();
  const save = page.getByRole('button', { name: 'Save answer', exact: true });
  await expectHitTarget(save);
  const saveBox = (await save.boundingBox())!;
  const railBox = (await page.locator('[data-edge-rail]').boundingBox())!;
  expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(railBox.y - 11);
  await page.getByRole('button', { name: 'Close search', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await field.fill('Garden studio');
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue(
    'Leave the bench clear.',
  );
  await navigateToModule(page, 'Wiki');
  await expect(page.getByRole('heading', { name: 'Wiki', exact: true })).toBeVisible();
  await expectAnchor(page, 3);
  await filters.click();
  await menu.getByRole('menuitemradio', { name: 'Creative work', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Pages tagged Creative work', exact: true }),
  ).toBeVisible();
  await expect(filters).toHaveAttribute('data-filtered', 'true');
  await filters.click();
  await menu.getByRole('menuitemradio', { name: 'All pages', exact: true }).click();
  await expect(filters).not.toHaveAttribute('data-filtered', 'true');
  await page.getByRole('button', { name: 'Find pages', exact: true }).click();
  const pageSearch = page.getByRole('textbox', { name: 'Find pages', exact: true });
  await pageSearch.fill('No matching fictional page');
  await expect(page.getByText('No pages found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('link', { name: 'Garden studio', exact: true }).click();
  await expectAnchor(page, 1);
  await expect(pageSearch).toHaveCount(0);
});

test('paired navigation scopes keep page controls and Settings independent of the gallery', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Navigation & workspace');
  const family = page.locator('[data-kit-comparison="navigation"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  await mobile.getByRole('button', { name: 'Find sample items', exact: true }).click();
  const field = mobile.getByRole('textbox', { name: 'Find sample items', exact: true });
  await field.fill('Mobile query');
  await expect(
    desktop.getByRole('textbox', { name: 'Find sample items', exact: true }),
  ).toHaveValue('');
  const rail = (await mobile.locator('[data-edge-rail]').boundingBox())!;
  const scope = (await mobile.locator('.kit-presentation').boundingBox())!;
  expect(rail.x + rail.width).toBeCloseTo(scope.x + scope.width - 12, 0);
  expect(rail.y + rail.height).toBeCloseTo(scope.y + scope.height - 12, 0);
  await mobile.getByRole('button', { name: 'Modules', exact: true }).click();
  const gear = mobile.getByRole('menuitem', { name: 'Settings', exact: true });
  expect((await gear.boundingBox())!.height).toBe(44);
  expect((await gear.locator('svg').boundingBox())!.width).toBe(16);
  await gear.click();
  const settings = mobile.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(mobile.getByRole('button', { name: 'Modules', exact: true })).toBeFocused();
  await expect(field).toHaveValue('Mobile query');
});

test('the rail combines page actions and keeps independent filters open while choices change', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Navigation & workspace');
  const mobile = page.locator('[data-kit-comparison="navigation"] [data-kit-preview="mobile"]');
  const desktop = page.locator('[data-kit-comparison="navigation"] [data-kit-preview="desktop"]');
  const rail = mobile.locator('[data-edge-rail]');
  await rail.getByRole('button', { name: 'Add sample item', exact: true }).click();
  await expect(mobile.getByText('Sample actions: 1', { exact: true })).toBeVisible();
  await rail.getByRole('button', { name: 'Reset sample count', exact: true }).click();
  await expect(mobile.getByText('Sample actions: 0', { exact: true })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Add sample item', exact: true })).toHaveCount(1);
  await mobile.getByRole('button', { name: 'Use multiple filters', exact: true }).click();
  const trigger = rail.getByRole('button', { name: 'Filters', exact: true });
  await trigger.click();
  const menu = mobile.getByRole('menu', { name: 'Page filters', exact: true });
  const notes = menu.getByRole('menuitemcheckbox', { name: 'Notes', exact: true });
  const sources = menu.getByRole('menuitemcheckbox', { name: 'Sources', exact: true });
  await expect(notes).toHaveAttribute('aria-checked', 'true');
  await expect(sources).toHaveAttribute('aria-checked', 'true');
  await notes.click();
  await expect(menu).toBeVisible();
  await expect(notes).toHaveAttribute('aria-checked', 'false');
  await expect(sources).toHaveAttribute('aria-checked', 'true');
  await expect(trigger).toHaveAttribute('data-filtered', 'true');
  await sources.click();
  await expect(mobile.getByText('Selected kinds: none', { exact: true })).toBeVisible();
  await notes.click();
  await sources.click();
  await expect(trigger).not.toHaveAttribute('data-filtered', 'true');
  const bounds = (await menu.boundingBox())!;
  const anchor = (await rail.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(anchor.x - 11);
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(
    desktop.getByRole('button', { name: 'Use multiple filters', exact: true }),
  ).toBeVisible();
});

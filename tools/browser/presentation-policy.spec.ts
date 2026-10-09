import { expect, test } from '@playwright/test';

test('a nested review closes before its drawer and leaves the parent usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/tests/browser.html');
  await page.getByRole('button', { name: 'Open agent', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Agent', exact: true });
  await parent.getByRole('textbox', { name: 'Panel draft' }).fill('Retain this task');
  await parent.getByRole('button', { name: 'Review in panel' }).click();
  const child = page.getByRole('dialog', { name: 'Review', exact: true });
  await expect(child).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(child).toBeHidden();
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Review in panel' })).toBeFocused();
  await expect(parent.getByRole('textbox', { name: 'Panel draft' })).toHaveValue(
    'Retain this task',
  );
  await page.keyboard.press('Tab');
  expect(await parent.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(parent).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open agent', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Preference' })).toBeVisible();
});

test('closing nested modal children preserves parent focus protection and releases the final background', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?policy');
  const background = page.getByRole('textbox', { name: 'Background draft' });
  await page.getByRole('button', { name: 'Open parent drawer' }).click();
  const parent = page.getByRole('dialog', { name: 'Parent', exact: true });
  await expect(parent).toBeVisible();
  await expect(background).toBeHidden();
  await parent.getByRole('button', { name: 'Open nested review' }).click();
  const child = page.getByRole('dialog', { name: 'Nested review', exact: true });
  await expect(child).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(child).toBeHidden();
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Open nested review' })).toBeFocused();
  await expect(background).toBeHidden();
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    expect(await parent.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await parent.getByRole('button', { name: 'Parent options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Keep task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Keep task' })).toBeHidden();
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Parent options' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(parent).toBeHidden();
  await expect(background).toBeVisible();
  await background.fill('Usable after final closure');
  await expect(background).toHaveValue('Usable after final closure');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('paired sample Escape closes only the focused sample and keeps the other editable', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Settings');
  const family = page.locator('[data-kit-comparison="settings"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  for (const sample of [desktop, mobile])
    await sample.getByRole('button', { name: 'Open settings' }).click();
  await desktop
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('textbox', { name: 'Model', exact: true })
    .fill('desktop remains');
  await mobile
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('textbox', { name: 'Model', exact: true })
    .fill('mobile remains');
  await page.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
  await expect(desktop.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await desktop
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('textbox', { name: 'Model', exact: true })
    .fill('still editable');
  await page.keyboard.press('Escape');
  await expect(desktop.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
  await expect(desktop.getByRole('button', { name: 'Open settings' })).toBeFocused();
});

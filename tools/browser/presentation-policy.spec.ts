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

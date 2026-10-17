import { expect, test } from '@playwright/test';
import { navigateToModule } from '@/ui/kit/navigation.browser.test-support.ts';

test('global topic map offers gentle defaults, local exploration and retained deep links', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.goto('/preview/');
  await navigateToModule(page, 'Graph');
  const diagram = page.getByRole('figure', { name: 'Global Vault graph' });
  await expect(diagram).toBeVisible();
  const rail = page.locator('[data-edge-rail]');
  if (await rail.isVisible()) {
    await expect(rail.getByRole('button', { name: 'Fit map', exact: true })).toBeVisible();
    await rail.getByRole('button', { name: 'Find a graph record', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'Find a graph record', exact: true });
    await search.fill('not present');
    await expect(page.getByText('No graph records found.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await rail.getByRole('button', { name: 'Filters', exact: true }).click();
    const choice = page.getByRole('menuitemcheckbox', { name: 'Sources', exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-checked', 'false');
    await choice.click();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Graph options', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Group by', exact: true })).toHaveValue('topics');
  await expect(page.getByRole('combobox', { name: 'Group cohesion' })).toHaveValue('soft');
  await expect(page.getByRole('combobox', { name: 'Within-topic spacing' })).toHaveValue(
    'balanced',
  );
  await expect(page.getByRole('combobox', { name: 'Topic separation' })).toHaveValue('close');
  await expect(page.getByRole('combobox', { name: 'Canvas edges' })).toHaveValue('tight');
  await page.getByRole('tab', { name: 'Vocabulary', exact: true }).click();
  await expect(
    page.getByText('Same relationship in both directions', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('tabpanel')
    .getByRole('button', { name: 'Explore Place', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Place', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Place', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Focus neighborhood', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Local Vault graph' })).toBeVisible();
  await page.getByRole('button', { name: 'Graph options', exact: true }).click();
  await page.getByRole('button', { name: 'Return to global map', exact: true }).click();
  await expect(diagram).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('graph search and unavailable deep links give explicit feedback', async ({ page }) => {
  await page.goto('/preview/#/graph/');
  await expect(page.getByRole('figure', { name: 'Global Vault graph' })).toBeVisible();
  await page.getByRole('button', { name: 'Graph options', exact: true }).click();
  await page.getByRole('tab', { name: 'Records', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find a graph record' }).fill('not present');
  await expect(page.getByText('No graph records found.', { exact: true })).toBeVisible();
  await page.goto('/preview/#/graph/missing/');
  await expect(
    page.getByText('This subject is unavailable or no longer has connections.', { exact: true }),
  ).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('Wiki home offers starting pages and a searchable, sortable directory', async ({ page }) => {
  await page.goto('/preview/wiki.html');
  const sample = page.locator('[data-design-preview]');
  await sample
    .getByRole('toolbar', { name: 'Wiki page' })
    .getByRole('button', { name: 'Wiki', exact: true })
    .click();
  const discovery = sample.getByRole('region', { name: 'Start exploring' });
  const directory = sample.getByRole('region', { name: 'Page directory' });
  await expect(discovery.getByRole('link')).toHaveCount(3);
  await expect(directory.getByRole('link')).toHaveText([
    'Garden studio',
    'Reading list',
    'Slow mornings',
  ]);
  await directory.getByRole('combobox', { name: 'Sort pages' }).selectOption('reverse');
  await expect(directory.getByRole('link')).toHaveText([
    'Slow mornings',
    'Reading list',
    'Garden studio',
  ]);
  await sample.getByRole('textbox', { name: 'Find pages' }).fill('  slow  ');
  await expect(discovery).toHaveCount(0);
  await expect(directory.getByRole('link')).toHaveText(['Slow mornings']);
  await expect(directory.getByRole('status')).toContainText('1 of 3 pages');
  await sample.getByRole('textbox', { name: 'Find pages' }).fill('missing');
  await expect(directory.getByRole('heading', { name: 'No pages found.' })).toBeVisible();
  await directory.getByRole('button', { name: 'Show all pages' }).click();
  await expect(directory.getByRole('link')).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  const cards = discovery.locator('[data-surface="subtle"]');
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  expect(first!.x).toBeGreaterThanOrEqual(0);
  expect(first!.x + first!.width).toBeLessThanOrEqual(390);
  await discovery.getByRole('link', { name: 'Garden studio', exact: true }).click();
  await expect(sample.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
});

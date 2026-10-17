import { expect, test } from '@playwright/test';

test('Map selects locations and keeps edited coordinates after reload', { tag: '@phone' }, async ({
  page,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/preview/index.html#/map/');
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Geographic map' })).toBeVisible();
  const marker = page.locator('.leaflet-marker-icon').first();
  await expect(marker).toBeVisible();
  await marker.click();
  await page.getByRole('button', { name: 'Edit coordinates', exact: true }).click();
  await page.getByLabel('Latitude', { exact: true }).fill('60.25');
  await page.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Edit coordinates', exact: true }) }),
  ).toHaveCount(0);
  await expect(page.getByText(/^60.250000,/)).toBeVisible();
  await page.reload();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  if (await page.getByRole('button', { name: 'Open coordinates', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open coordinates', exact: true }).click();
  await expect(page.getByText(/^60.2500,/)).toBeVisible();
});

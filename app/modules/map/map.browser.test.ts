import { expect, test } from '@playwright/test';
test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

test('Map selects locations and keeps edited coordinates after reload', { tag: '@phone' }, async ({
  page,
}) => {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.goto('/preview/index.html#/map/');
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Geographic map' })).toBeVisible();
  const marker = page.locator('.kit-map-marker').first();
  await expect(marker).toBeVisible();
  await marker.click();
  await page.getByRole('button', { name: 'Edit coordinates', exact: true }).click();
  await page.getByLabel('Latitude', { exact: true }).fill('60.25');
  await page.getByLabel('Location precision', { exact: true }).selectOption('street');
  await page.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Edit coordinates', exact: true }) }),
  ).toHaveCount(0);
  await expect(page.getByText(/^60.250000,/)).toBeVisible();
  await expect(
    page.getByLabel('Selected location').getByText('Street-level location'),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('.kit-map-marker').first()).toBeVisible();
  if (await page.getByRole('button', { name: 'Open coordinates', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open coordinates', exact: true }).click();
  await expect(page.getByText(/^60.2500,/)).toBeVisible();
  await expect(page.getByText('Street-level location')).toBeVisible();
});

test('Map restores Positron and Dark styles while retaining selection through appearance changes', async ({
  page,
}) => {
  const styles: string[] = [];
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route('https://tiles.openfreemap.org/**', (route) => {
    styles.push(route.request().url());
    return route.fulfill({
      json: {
        version: 8,
        sources: {
          attribution: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            attribution: 'Map contributors',
          },
        },
        layers: [
          { id: 'attributed-points', type: 'circle', source: 'attribution' },
          {
            id: 'ground',
            type: 'background',
            paint: {
              'background-color': route.request().url().endsWith('/dark') ? '#111113' : '#f4f4f5',
            },
          },
        ],
      },
    });
  });
  await page.goto('/preview/index.html#/map/');
  const map = page.getByRole('region', { name: 'Geographic map' });
  await expect(map.locator('canvas')).toBeVisible();
  const attribution = map.locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toHaveClass(/maplibregl-compact/);
  await expect(attribution).not.toHaveClass(/maplibregl-compact-show/);
  await expect(attribution).not.toHaveAttribute('open');
  await attribution.locator('summary').click();
  await expect(attribution).toHaveClass(/maplibregl-compact-show/);
  await expect(attribution.getByText('Map contributors')).toBeVisible();
  const controls = map.locator('.maplibregl-ctrl-bottom-right');
  await expect(controls.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  const geometry = await map.boundingBox();
  const zoom = await controls.getByRole('button', { name: 'Zoom in' }).boundingBox();
  expect(zoom!.y).toBeGreaterThan(geometry!.y + geometry!.height / 2);

  await expect.poll(() => styles.some((url) => url.endsWith('/styles/positron'))).toBe(true);
  const marker = map.getByRole('button', { name: 'Garden studio', exact: true });
  await marker.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  const color = await marker
    .locator('span')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => styles.some((url) => url.endsWith('/styles/dark'))).toBe(true);
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      marker.locator('span').evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(color);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect
    .poll(() => styles.filter((url) => url.endsWith('/styles/positron')).length)
    .toBeGreaterThan(1);
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
});

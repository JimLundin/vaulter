import process from 'node:process';
import { expect, test } from '@playwright/test';

// Real public tiles are opt-in; the ordinary catalogue/browser suite remains offline.
// biome-ignore lint/suspicious/noSkippedTests: Real tile requests require explicit opt-in and run in map acceptance.
test.skip(
  process.env.VAULTER_MAP_TILES !== '1',
  'Set VAULTER_MAP_TILES=1 for real OpenFreeMap acceptance.',
);
test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

test('real maps retain selected places and keep markers in frame through size and appearance changes', async ({
  page,
}) => {
  const responses: { url: string; status: number }[] = [];
  page.on('response', (response) => {
    if (response.url().includes('openfreemap'))
      responses.push({ url: response.url(), status: response.status() });
  });
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Map');
  await page.getByRole('radio', { name: 'Dark', exact: true }).first().click();
  const family = page.locator('[data-kit-comparison="maps"]');
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    await sample.getByRole('button', { name: 'Load map', exact: true }).click();
    const map = sample.getByRole('region', { name: 'Places in your notes', exact: true });
    await expect(map.locator('canvas')).toHaveCount(1);
    await expect(map.locator('.maplibregl-marker')).toHaveCount(3);
    await sample.getByRole('button', { name: 'Walk by the water', exact: true }).click();
    for (const [button, height] of [
      ['Compact map', 132],
      ['Section map', 256],
      ['Fill map', 256],
    ] as const) {
      await sample.getByRole('button', { name: button, exact: true }).click();
      await expect
        .poll(async () => (await map.boundingBox())!.height)
        .toBeGreaterThanOrEqual(height);
      await expect(
        sample.getByText('Selected place: Walk by the water', { exact: true }),
      ).toBeVisible();
      for (const marker of await map.locator('.maplibregl-marker').all()) {
        await expect
          .poll(async () => {
            const bounds = (await map.boundingBox())!;
            const point = (await marker.boundingBox())!;
            return Math.min(
              point.x - bounds.x,
              point.y - bounds.y,
              bounds.x + bounds.width - point.x - point.width,
              bounds.y + bounds.height - point.y - point.height,
            );
          })
          .toBeGreaterThanOrEqual(0);
      }
    }
  }
  await expect
    .poll(
      () => responses.some((response) => response.url.includes('.pbf') && response.status === 200),
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.getByRole('radio', { name: 'Light', exact: true }).first().click();
  await expect
    .poll(
      () =>
        responses.some(
          (response) => response.url.endsWith('/styles/positron') && response.status === 200,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    await expect(sample.locator('.maplibregl-marker')).toHaveCount(3);
    await expect(
      sample.getByText('Selected place: Walk by the water', { exact: true }),
    ).toBeVisible();
  }
});

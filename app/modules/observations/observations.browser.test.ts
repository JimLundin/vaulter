import { expect, test } from '@playwright/test';

test('embedded Observation exposes recorded measurement context and raw quality on narrow and wide layouts', async ({
  page,
}) => {
  await page.goto('/preview/records.html');
  const card = page.getByText('Weather observation', { exact: true });
  await expect(card).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(card).toBeVisible();
    await expect(page.getByText('Measurement latitude: 59.3', { exact: true })).toBeVisible();
    await expect(page.getByText('Temperature (°C): 11.4', { exact: true })).toBeVisible();
    await expect(page.getByText('Daylight: No', { exact: true })).toBeVisible();
    await expect(page.getByText('requested: Recorded as missing', { exact: true })).toBeVisible();
    await expect(page.getByText(/Raw measurements:.*partly cloudy/)).toBeVisible();
    await expect(page.getByText(/Quality:.*coordinates of the place page/)).toBeVisible();
  }
});

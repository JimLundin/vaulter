import { expect, test } from '@playwright/test';

test('Calendar selects days, keeps uncertain dates out of day cells, and saves explicit events', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/index.html#/calendar/');
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  const header = page.getByRole('toolbar', { name: 'Calendar', exact: true });
  await expect(header.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  const headerBounds = await header.boundingBox();
  expect(headerBounds?.y).toBe(0);
  expect(headerBounds?.height).toBe(48);
  await expect(header.getByText('Plans, occurrences and dates worth remembering.')).toHaveCount(0);
  const rail = page.getByRole('toolbar', { name: 'Module controls', exact: true });
  if (await rail.isVisible()) {
    for (const name of ['Add event', 'Manage events', 'Previous month', 'Next month']) {
      await expect(rail.getByRole('button', { name, exact: true })).toBeVisible();
    }
  } else {
    await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'November 2026', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'October 2026', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^24 October 2026,/ }).click();
  const day = page.getByRole('region', { name: 'On 2026-10-24' });
  await expect(day.getByRole('heading', { name: 'Studio open afternoon' })).toBeVisible();
  await expect(day.getByText('Autumn planting')).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Timeframes & approximate dates' })
      .getByRole('heading', { name: 'Autumn planting', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByLabel('Event title', { exact: true }).fill('Walk with neighbours');
  await page.getByLabel('Date precision', { exact: true }).selectOption('day');
  await page.getByLabel('Event date', { exact: true }).fill('2026-10-24');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(day.getByRole('heading', { name: 'Walk with neighbours' })).toBeVisible();
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  if (await filters.isVisible()) {
    await filters.click();
    await page.getByRole('menuitemradio', { name: 'Timeline', exact: true }).click();
  } else await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'October 2026' })
      .getByRole('heading', { name: 'Autumn planting', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage events', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Walk with neighbours', exact: true }).click();
  await page.getByLabel('Status', { exact: true }).selectOption('occurred');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage events', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Walk with neighbours', exact: true }).click();
  await page.getByRole('button', { name: 'Keep event', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'October 2026' })
      .getByRole('heading', { name: 'Walk with neighbours', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage events', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Walk with neighbours', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove event', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'October 2026' })
      .getByRole('heading', { name: 'Walk with neighbours', exact: true }),
  ).toHaveCount(0);
});

test('Wiki embeds the same subject timeline including imprecise history and unknown dates', async ({
  page,
}) => {
  await page.goto('/preview/calendar.html?embedded');
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  const timeline = page.getByRole('region', { name: 'Subject timeline' });
  await expect(timeline.getByRole('heading', { name: 'First sketch of the studio' })).toBeVisible();
  await expect(timeline.getByText(/Around June 2026/)).toBeVisible();
  await expect(timeline.getByText(/Date unknown · to be confirmed/)).toBeVisible();
});

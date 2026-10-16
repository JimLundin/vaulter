import { expect, test } from '@playwright/test';
import { navigateToModule } from '../../ui/kit/navigation.browser.test-support.ts';

test('Graph navigation explores connections and vocabulary and retains selection across layouts', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.goto('/preview/');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await navigateToModule(page, 'Graph');
  await expect(page.getByRole('heading', { name: 'Graph', exact: true })).toBeVisible();
  await page.goto('/preview/#/graph/preview%3Apage%3A0/');
  const diagram = page.getByRole('figure', { name: 'Connections around Garden studio' });
  await expect(diagram).toBeVisible();
  const mornings = diagram.getByRole('button', { name: 'Explore Slow mornings', exact: true });
  const target = await mornings.boundingBox();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  expect(target!.width).toBeGreaterThanOrEqual(44);
  await mornings.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/graph\/preview%3Apage%3A1\/$/);
  await expect(
    page.getByRole('figure', { name: 'Connections around Slow mornings' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Vocabulary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Related to', exact: true })).toBeVisible();
  await expect(
    page.getByText('Same relationship in both directions', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Explore Place', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Connections around Place' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Connections', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('figure', { name: 'Connections around Place' })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('figure', { name: 'Connections around Place' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test('Graph subjects can be searched and unavailable deep links are explicit', async ({ page }) => {
  await page.goto('/preview/#/graph/');
  await page.getByRole('searchbox', { name: 'Find graph subjects' }).fill('not present');
  await expect(page.getByText('No subjects found.', { exact: true })).toBeVisible();
  await page.goto('/preview/#/graph/missing/');
  await expect(
    page.getByText('This subject is unavailable or no longer has connections.', { exact: true }),
  ).toBeVisible();
});

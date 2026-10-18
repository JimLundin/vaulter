import { expect, test } from '@playwright/test';

test('Tasks board retains every status and embedded card when moving a task on compact and wide layouts', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/tasks/');
  await expect(page.getByRole('heading', { name: 'Choose bulbs for the garden' })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Backlog', 'Ready', 'In progress', 'Done'])
      await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  }
  const card = page.getByRole('region', { name: 'Choose bulbs for the garden', exact: true });
  await card.getByLabel('Move Choose bulbs for the garden', { exact: true }).selectOption('ready');
  await expect(
    page
      .getByRole('region', { name: 'Ready', exact: true })
      .getByRole('heading', { name: 'Choose bulbs for the garden' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Cancelled and abandoned tasks', exact: true })
      .getByRole('heading', { name: 'Build a second garden shed' }),
  ).toBeVisible();
});

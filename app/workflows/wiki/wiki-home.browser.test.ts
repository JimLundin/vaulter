import { expect, test } from '@playwright/test';

test('Wiki sidebar browses pages independently of the curated home and stays available while reading', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/wiki.html');
  const sample = page.locator('[data-design-preview]');
  await sample
    .getByRole('toolbar', { name: 'Wiki page' })
    .getByRole('button', { name: 'Wiki', exact: true })
    .click();
  const compact = test.info().project.name === 'phone';
  if (compact) await sample.getByRole('button', { name: 'Pages', exact: true }).click();
  const directory = sample.getByRole('region', { name: 'Page directory' });
  const pageLinks = directory.getByRole('link').filter({ hasNotText: 'Wiki home' });
  await expect(pageLinks).toHaveText(['Garden studio', 'Reading list', 'Slow mornings']);
  await directory.getByRole('combobox', { name: 'Sort pages' }).selectOption('reverse');
  await expect(pageLinks).toHaveText(['Slow mornings', 'Reading list', 'Garden studio']);
  await directory.getByRole('textbox', { name: 'Find pages' }).fill('  slow  ');
  await expect(pageLinks).toHaveText(['Slow mornings']);
  await expect(directory.getByRole('status')).toContainText('1 of 3 pages');
  await directory.getByRole('textbox', { name: 'Find pages' }).fill('missing');
  await expect(directory.getByText('No pages found.')).toBeVisible();
  await directory.getByRole('button', { name: 'Show all pages' }).click();
  await directory.getByRole('link', { name: 'Slow mornings', exact: true }).click();
  await expect(sample.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
  if (compact) {
    await expect(sample.getByRole('dialog', { name: 'Pages', exact: true })).toBeHidden();
    await sample.getByRole('button', { name: 'Pages', exact: true }).click();
  }
  await expect(directory.getByRole('link', { name: 'Slow mornings', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await directory.getByRole('link', { name: 'Wiki home', exact: true }).click();
  const focus = sample.getByRole('region', { name: 'In focus' });
  await expect(focus.getByRole('link').first()).toHaveText('Garden studio');
  await expect(sample.getByRole('region', { name: 'From the pages' })).toContainText(
    'Keep mornings free.',
  );
  if (!compact) {
    await directory.getByRole('textbox', { name: 'Find pages' }).fill('reading');
    await expect(focus.getByRole('link')).toHaveCount(3);
    const sidebar = await directory.boundingBox();
    const content = await focus.boundingBox();
    expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(content!.x);
  } else {
    await sample.getByRole('button', { name: 'Pages', exact: true }).click();
    const close = sample.getByRole('button', { name: 'Close pages', exact: true });
    await close.click();
    await expect(sample.getByRole('button', { name: 'Pages', exact: true })).toBeFocused();
  }
});

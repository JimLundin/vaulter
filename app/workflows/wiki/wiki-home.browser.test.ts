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
  const pageLinks = directory.locator('[data-selection-appearance=card]');
  expect(
    await pageLinks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))),
  ).toEqual(['Garden studio', 'Reading list', 'Slow mornings']);
  await directory.getByRole('combobox', { name: 'Sort pages' }).selectOption('reverse');
  expect(
    await pageLinks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))),
  ).toEqual(['Slow mornings', 'Reading list', 'Garden studio']);
  await directory.getByRole('textbox', { name: 'Find pages' }).fill('  slow  ');
  await expect(pageLinks).toHaveCount(1);
  await expect(pageLinks).toHaveAttribute('aria-label', 'Slow mornings');
  await expect(directory.getByRole('status')).toContainText('1 of 3 pages');
  await directory.getByRole('textbox', { name: 'Find pages' }).fill('missing');
  await expect(directory.getByText('No pages found.')).toBeVisible();
  await directory.getByRole('button', { name: 'Show all pages' }).click();
  await directory.getByRole('button', { name: 'Slow mornings', exact: true }).click();
  await expect(sample.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
  if (compact) {
    await expect(sample.getByRole('dialog', { name: 'Pages', exact: true })).toBeHidden();
    await sample.getByRole('button', { name: 'Pages', exact: true }).click();
  }
  await expect(
    directory.getByRole('button', { name: 'Slow mornings', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await directory.getByRole('link', { name: 'Wiki home', exact: true }).click();
  const focus = sample.getByRole('region', { name: 'In focus' });
  await expect(focus.getByRole('link').first()).toHaveText('Garden studio');
  await expect(sample.getByRole('region', { name: 'From the pages' })).toContainText(
    'Keep mornings free.',
  );
  if (!compact) {
    await directory.getByRole('textbox', { name: 'Find pages' }).fill('reading');
    await expect(focus.getByRole('link')).toHaveCount(1);
    await sample.getByRole('button', { name: 'Next featured page' }).click();
    await expect(focus.getByRole('link')).toHaveText('Reading list');
    const sidebar = await directory.boundingBox();
    const content = await focus.boundingBox();
    expect(sidebar!.x).toBeGreaterThanOrEqual(content!.x + content!.width);
  } else {
    await sample.getByRole('button', { name: 'Pages', exact: true }).click();
    const close = sample.getByRole('button', { name: 'Close pages', exact: true });
    await close.click();
    await expect(sample.getByRole('button', { name: 'Pages', exact: true })).toBeFocused();
  }
});

test('Wiki home fits the center while its page cards scroll independently', async ({ page }) => {
  await page.goto('/preview/#/wiki/');
  const home = page.getByRole('region', { name: 'Wiki home', exact: true });
  await expect(home).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 1440, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(home.locator('[data-slot="scroll-area-viewport"]')).toHaveCount(0);
    const box = (await home.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(home.getByRole('region', { name: 'In focus' })).toBeInViewport();
    const geometry = await home.evaluate((node) => ({
      height: node.clientHeight,
      content: node.scrollHeight,
    }));
    expect(geometry.content).toBeLessThanOrEqual(geometry.height + 1);
  }
});

import { expect, test } from '@playwright/test';

test('shared passage cards keep exact marked text visible, expand by keyboard and keep paired state independent', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('PassageCard');
  const family = page.locator('[data-kit-comparison="passages"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  const sample = test.info().project.name === 'phone' ? mobile : desktop;
  const other = test.info().project.name === 'phone' ? desktop : mobile;
  const card = sample.getByRole('region', { name: 'Retained passage' });
  const toggle = card.getByRole('button', { name: 'Context from Planning note' });
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('mark')).toHaveText('Keep mornings free.');
  await expect(card.locator('mark')).toBeInViewport();
  await toggle.focus();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByLabel('Passage context')).toContainText('Earlier plans. Earlier plans.');
  await expect(other.getByRole('button', { name: 'Context from Planning note' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const context = card.getByLabel('Passage context');
  await context.focus();
  await context.press('End');
  await expect(context).toBeFocused();
  await expect(card.getByRole('link', { name: 'Planning note' })).toHaveAttribute(
    'href',
    '#planning-note',
  );
  await toggle.click();
  await expect(card.locator('mark')).toBeInViewport();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sample.getByText('No retained passage')).toBeVisible();
  await page.screenshot({
    path: `/tmp/vaulter-47-passage-preview-${test.info().project.name}.png`,
  });
});

test('expanded passage scrolling stays with the same text through viewport rearrangement', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/wiki.html');
  await page.getByRole('button', { name: 'Evidence for Keep mornings free.', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Context from Studio plans' });
  await toggle.click();
  const context = page.getByLabel('Source context');
  await context.focus();
  const original = await context.elementHandle();
  await context.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const before = await context.evaluate((node) => node.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(context).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await context.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(context).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({
    path: `/tmp/vaulter-47-wiki-source-context-${test.info().project.name}.png`,
  });
});

import { expect, test } from '@playwright/test';

test('a linked note preview follows its source while the bounded sample scrolls', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Linked content');
  const sample = page.locator('[data-kit-comparison="linked-content"] [data-kit-preview="mobile"]');
  const trigger = sample.getByRole('button', { name: 'Show linked note preview' });
  await trigger.click();
  const preview = sample.getByRole('tooltip');
  await expect(preview).toContainText('Coffee with Anna');
  const gap = async () => {
    const anchor = (await trigger.boundingBox())!;
    const popup = (await preview.boundingBox())!;
    return Math.round(anchor.y - popup.y - popup.height);
  };
  await expect.poll(gap).toBe(8);
  const viewport = sample.locator('.kit-specimen-content > [data-slot="scroll-area-viewport"]');
  expect(await viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await viewport.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect.poll(gap).toBe(8);
  await trigger.click();
  await expect(preview).toBeHidden();
});

test('an open linked note preview uses updated same-layout canvas bounds', async ({ page }) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Linked content');
  const sample = page.locator(
    '[data-kit-comparison="linked-content"] [data-kit-preview="desktop"]',
  );
  await sample.evaluate((node) => {
    node.style.height = '700px';
  });
  const trigger = sample.getByRole('button', { name: 'Show linked note preview' });
  await trigger.click();
  const preview = sample.getByRole('tooltip');
  await expect(preview).toBeVisible();
  // Change available space without changing the sample's size class or its source rectangle.
  await sample.evaluate((node) => {
    node.style.height = '560px';
  });
  await expect
    .poll(async () => {
      const anchor = (await trigger.boundingBox())!;
      const popup = (await preview.boundingBox())!;
      return Math.round(anchor.y - popup.y - popup.height);
    })
    .toBe(8);
  await expect(trigger).toBeFocused();
});

test('a menu in an offscreen paired sample avoids its local lower and right edges', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Dropdown menus');
  const family = page.locator('[data-kit-comparison="menus"]');
  const sample = family.locator('[data-kit-preview="mobile"]');
  const trigger = sample.getByRole('button', { name: 'Note options' });
  // Put the ordinary menu example against its canvas edge, still outside the browser viewport.
  await sample.locator('.kit-sample').evaluate((node) => {
    node.style.cssText =
      'display:flex; height:100%; align-items:flex-end; justify-content:flex-end';
  });
  await trigger.evaluate((node) => {
    node.focus({ preventScroll: true });
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  const menu = sample.getByRole('menu').first();
  await expect(menu).toBeVisible();
  const comparison = family.locator('.kit-comparison-scroll > [data-slot="scroll-area-viewport"]');
  await comparison.evaluate((node) => {
    node.scrollLeft = 0;
  });
  const bounds = (await sample.boundingBox())!;
  expect(bounds.x).toBeGreaterThan(390);
  await expect.poll(async () => (await menu.boundingBox())!.height).toBeGreaterThan(180);
  await expect
    .poll(async () => {
      const popup = (await menu.boundingBox())!;
      return popup.x + popup.width - bounds.x - bounds.width;
    })
    .toBeLessThanOrEqual(0);
  await expect
    .poll(async () => {
      const popup = (await menu.boundingBox())!;
      return popup.y + popup.height - bounds.y - bounds.height;
    })
    .toBeLessThanOrEqual(0);
  await comparison.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await sample.scrollIntoViewIfNeeded();
  await expect(menu.getByRole('menuitem', { name: 'Open note' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Pinned' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await trigger.press('ArrowDown');
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await family
    .locator('[data-kit-preview="desktop"]')
    .getByRole('button', { name: 'Note options' })
    .click();
  await expect(menu).toBeVisible();
  await expect(
    family.locator('[data-kit-preview="desktop"]').getByRole('menu').first(),
  ).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(
    family.locator('[data-kit-preview="desktop"]').getByRole('menu').first(),
  ).toBeVisible();
});

test('focused help in an offscreen sample stays within its own canvas and remains nonintrusive', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Buttons & selection');
  const family = page.locator('[data-kit-comparison="buttons"]');
  const sample = family.locator('[data-kit-preview="mobile"]');
  const trigger = sample.getByRole('button', { name: 'Hover or focus for help' });
  await sample.locator('.kit-sample').evaluate((node) => {
    node.style.cssText = 'display:flex; justify-content:flex-end';
  });
  await page.keyboard.press('Tab');
  await trigger.evaluate((node) => node.focus({ preventScroll: true }));
  const tooltip = sample.getByRole('tooltip');
  await expect(tooltip).toContainText('Save this note to your vault.');
  const comparison = family.locator('.kit-comparison-scroll > [data-slot="scroll-area-viewport"]');
  await comparison.evaluate((node) => {
    node.scrollLeft = 0;
  });
  await expect
    .poll(async () => {
      const bounds = (await sample.boundingBox())!;
      const popup = (await tooltip.boundingBox())!;
      return Math.round(popup.x + popup.width - bounds.x - bounds.width);
    })
    .toBeLessThanOrEqual(0);
  const bounds = (await sample.boundingBox())!;
  const popup = (await tooltip.boundingBox())!;
  expect(bounds.x).toBeGreaterThan(390);
  expect(popup.x).toBeGreaterThanOrEqual(bounds.x);
  expect(popup.y).toBeGreaterThanOrEqual(bounds.y);
  await expect(trigger).toBeFocused();
  await comparison.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(trigger).toBeFocused();
  await family
    .locator('[data-kit-preview="desktop"]')
    .getByRole('button', { name: 'Save note', exact: true })
    .click();
  await expect(tooltip).toBeHidden();
});

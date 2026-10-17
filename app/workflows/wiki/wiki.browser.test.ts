import { expect, test } from '@playwright/test';
import { setPreviewMobile } from '@/ui/kit/preview.browser.test-support.ts';

test('fictional Wiki nodes keep selected evidence and expanded source context across bounded arrangements', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/wiki.html');
  const desktop = page.locator('[data-design-preview]');
  const claim = desktop.getByRole('button', {
    name: 'Evidence for Keep mornings free.',
    exact: true,
  });
  await claim.click();
  const toggle = desktop.getByRole('button', { name: 'Context from Studio plans' });
  await toggle.click();
  await toggle.focus();
  const original = await toggle.elementHandle();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(desktop.getByLabel('Source context')).toContainText('Earlier plans. Earlier plans.');
  await expect(
    desktop.getByText('Source has a newer version. This excerpt stays tied to the original.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(toggle).toBeFocused();
  await setPreviewMobile(desktop, true);
  await expect(desktop.getByRole('dialog', { name: 'References', exact: true })).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  await toggle.focus();
  await page.keyboard.press('Escape');
  await expect(claim).toBeFocused();
  await expect(claim).toHaveAttribute('aria-pressed', 'false');
  await claim.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await setPreviewMobile(desktop, false);
  await desktop
    .getByRole('heading', { name: 'Garden studio', exact: true })
    .getByRole('button')
    .click();
  const pane = desktop.getByRole('complementary', { name: 'References', exact: true });
  await expect(pane.locator('mark')).toHaveCount(0);
  const scroll = pane.locator('[data-slot="scroll-area-viewport"]');
  await scroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(pane.getByRole('link', { name: 'Planning note 12' })).toBeInViewport();
  await claim.click();
  await expect(pane.getByRole('link', { name: 'Studio plans' })).toBeInViewport();
});

test('Wiki fictional reader exposes filtering, loading, errors and missing records', async ({
  page,
}) => {
  await page.goto('/preview/wiki.html');
  const sample = page.locator('[data-design-preview]');
  await sample.getByRole('button', { name: 'Tag: Creative work', exact: true }).click();
  await expect(sample.getByRole('heading', { name: 'Pages tagged Creative work' })).toBeVisible();
  await sample.getByRole('textbox', { name: 'Find pages' }).fill('missing');
  await expect(sample.getByText('No pages found.')).toBeVisible();
  await sample.getByRole('button', { name: 'Toggle loading' }).click();
  await expect(sample.getByText('Opening pages…')).toBeVisible();
  await sample.getByRole('button', { name: 'Show error' }).click();
  await expect(sample.getByRole('alert')).toHaveText('Fictional read failed.');
  await sample.getByRole('button', { name: 'Show unavailable page' }).click();
  await expect(sample.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
});

test('fictional Wiki navigation returns to the local index and opens the selected record', async ({
  page,
}) => {
  await page.goto('/preview/wiki.html');
  const example = page.locator('[data-design-preview]');
  await example
    .getByRole('toolbar', { name: 'Wiki page' })
    .getByRole('button', { name: 'Wiki', exact: true })
    .click();
  await expect(example.getByRole('textbox', { name: 'Find pages' })).toBeVisible();
  await example.getByRole('link', { name: 'Slow mornings', exact: true }).click();
  await expect(example.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
});

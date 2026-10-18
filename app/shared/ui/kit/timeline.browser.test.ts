import { expect, test } from '@playwright/test';

test('paired chronologies retain independent selection and disclosure across resizing', async ({
  page,
}) => {
  await page.goto('/shared/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Calendar & timeline');
  const family = page.locator('[data-kit-comparison="chronology"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobileDay = mobile.getByRole('button', { name: /^17 October 2026,/ });
  await mobileDay.click();
  await expect(mobileDay).toHaveAttribute('aria-pressed', 'true');
  await expect(desktop.getByRole('button', { name: /^17 October 2026,/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await mobile.getByText('Details for A walk in the garden', { exact: true }).click();
  await expect(mobile.getByText('Bring a notebook.', { exact: true })).toBeVisible();
  await expect(desktop.getByText('Bring a notebook.', { exact: true })).toBeHidden();
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(mobileDay).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile.getByText('Bring a notebook.', { exact: true })).toBeVisible();
});

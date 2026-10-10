import { expect, test } from '@playwright/test';

test('paired browsing rows use plain framing and keep context and separate actions', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Items & people');
  const family = page.locator('[data-kit-comparison="items"]');
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    const row = sample.locator('[data-slot="item"]').filter({ hasText: 'Morning walk' });
    await expect(row).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(row.getByText('Pinned note', { exact: true })).toBeVisible();
    await expect(row.getByText('Saved just now', { exact: true })).toBeVisible();
    const action = row.getByRole('button', { name: 'Open morning walk' });
    await expect(action).toBeVisible();
    await action.click();
    await expect(sample.getByText('Opened morning walk.', { exact: true })).toBeVisible();
    const current = sample.getByRole('button', { name: 'Current reading note' });
    await expect(current).toHaveAttribute('aria-current', 'true');
    await expect(current).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await current.focus();
    await expect(current).toBeFocused();
    await expect(current.locator('[data-slot="item-media"]')).toHaveCSS('border-width', '1px');
    const thumbnail = sample.getByRole('img', { name: 'Supplied preview thumbnail' });
    await expect(thumbnail).toHaveCSS('object-fit', 'cover');
    expect(
      await thumbnail.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    ).toBe(true);
    for (const initials of ['AB', 'NN', 'PP', 'DE'])
      await expect(sample.getByText(initials, { exact: true })).toBeVisible();
    await expect(sample.locator('[data-slot="item-separator"]')).toHaveCount(3);
  }
});

test('paired named chips retain passive labels and activate supplied actions with the keyboard', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Status & feedback');
  const family = page.locator('[data-kit-comparison="status"]');
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    await expect(sample.getByText('Anna', { exact: true })).toBeVisible();
    await expect(sample.getByRole('button', { name: 'Anna', exact: true })).toHaveCount(0);
    const chip = sample.getByRole('button', { name: 'Pascal', exact: true });
    await chip.focus();
    await chip.press('Space');
    await expect(sample.getByText('Pascal selected 1 time.', { exact: true })).toBeVisible();
    if (device === 'mobile') {
      const bounds = (await chip.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
  }
});

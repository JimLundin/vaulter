import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports these browser types.
import type { Locator } from '@playwright/test';

async function changeVariant(picker: Locator, current: string, direction: number) {
  const select = picker.getByRole('combobox', { name: 'Input button variant' });
  if (await select.count()) {
    const variants = ['A', 'B', 'C'];
    await select.selectOption(
      variants[(variants.indexOf(current) + direction + variants.length) % variants.length],
    );
  } else
    await picker
      .getByRole('button', { name: direction > 0 ? 'Next variant' : 'Previous variant' })
      .click();
}

for (const variant of ['A', 'B', 'C']) {
  test(`input preview ${variant} preserves drafts, recording and one focus-dependent action`, async ({
    page,
  }) => {
    await page.goto(`/preview/?variant=${variant}`);
    const banner = page.getByRole('complementary', { name: 'Design preview' });
    const picker = banner.getByRole('group', { name: 'Input button style preview' });
    await expect(picker).toBeVisible();
    const composer = page.getByRole('group', { name: 'Message composer' });
    const field = page.getByRole('textbox', { name: 'Message', exact: true });
    const mic = page.getByRole('button', { name: 'Start voice interaction' });
    const send = page.getByRole('button', { name: 'Send', exact: true });
    const treatment =
      variant === 'A'
        ? 'preview-input-outline'
        : variant === 'B'
          ? 'default'
          : 'preview-input-plain';
    await expect(mic).toHaveAttribute('data-variant', treatment);
    await expect(composer.getByRole('button')).toHaveCount(1);
    await field.focus();
    await expect(send).toBeDisabled();
    await expect(send.locator('svg')).toHaveClass(/lucide-corner-down-left/);
    await field.fill('   ');
    await expect(send).toBeDisabled();
    await field.fill('Keep my draft');
    await expect(send).toBeEnabled();
    await field.blur();
    await expect(mic).toBeVisible();
    await changeVariant(picker, new URL(page.url()).searchParams.get('variant')!, 1);
    await expect(field).toHaveValue('Keep my draft');
    expect(new URL(page.url()).searchParams.get('variant')).not.toBe(variant);
    await changeVariant(picker, new URL(page.url()).searchParams.get('variant')!, -1);
    expect(new URL(page.url()).searchParams.get('variant')).toBe(variant);
    await field.focus();
    await expect(send).toHaveAttribute('data-variant', treatment);
    await field.press('ArrowLeft');
    expect(new URL(page.url()).searchParams.get('variant')).toBe(variant);
    await field.blur();
    await mic.click();
    await expect(field).toHaveValue(/^Keep my draft Leave/);
    await changeVariant(picker, new URL(page.url()).searchParams.get('variant')!, 1);
    const finish = page.getByRole('button', { name: 'Finish recording' });
    await expect(finish).toBeVisible();
    await expect(field).not.toBeFocused();
    await expect(composer.getByRole('button')).toHaveCount(1);
    await finish.click();
    await expect(mic).toBeVisible();
    await field.fill('Tell me about the garden');
    await send.click();
    await expect(field).toHaveValue('');
    await expect(page.locator('[data-message="user"]')).toHaveCount(1);
    await expect(mic).toBeVisible();
    await page.reload();
    const select = picker.getByRole('combobox', { name: 'Input button variant' });
    if (await select.count())
      await expect(select).toHaveValue(new URL(page.url()).searchParams.get('variant')!);
    else await expect(picker).toContainText(`${new URL(page.url()).searchParams.get('variant')} ·`);
  });
}

test('the preview variant shortcut yields to device radio navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/?variant=A');
  const windowMode = page.getByRole('radio', { name: 'Window', exact: true });
  await windowMode.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Desktop', exact: true })).toBeChecked();
  expect(new URL(page.url()).searchParams.get('variant')).toBe('A');
  await page.getByRole('button', { name: 'Next variant' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/variant=B/);
});

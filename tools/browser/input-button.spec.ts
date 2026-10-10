import { expect, test } from '@playwright/test';
import { choosePreviewDevice } from './preview-controls.ts';

for (const appearance of ['light', 'dark'] as const) {
  test(`the unified ${appearance} input shares the primary style and preserves drafts and recording`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: appearance });
    // Older comparison links now use the same shared style.
    await page.goto('/preview/?variant=A');
    const banner = page.getByRole('complementary', { name: 'Design preview' });
    await expect(banner.getByRole('group', { name: 'Input button style preview' })).toHaveCount(0);
    await expect(banner.getByRole('combobox', { name: 'Input button variant' })).toHaveCount(0);
    const composer = page.getByRole('group', { name: 'Message composer' });
    const field = page.getByRole('textbox', { name: 'Message', exact: true });
    const mic = page.getByRole('button', { name: 'Start voice interaction' });
    const send = page.getByRole('button', { name: 'Send', exact: true });
    const treatment = await page
      .getByRole('button', { name: 'New chat', exact: true })
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          color: style.color,
          border: style.borderTopWidth,
        };
      });
    expect(treatment.border).toBe('0px');
    expect(treatment.background).toBe(
      appearance === 'light' ? 'rgb(24, 24, 27)' : 'rgb(250, 250, 250)',
    );
    for (const button of [mic, send]) {
      if (button === send) await field.fill('Keep my draft');
      await expect(button).toHaveAttribute('data-variant', 'filled');
      await expect
        .poll(() =>
          button.evaluate((node) => {
            const style = getComputedStyle(node);
            return {
              background: style.backgroundColor,
              color: style.color,
              border: style.borderTopWidth,
            };
          }),
        )
        .toEqual(treatment);
      await expect(button).toHaveCSS('border-radius', '8px');
      const box = (await button.boundingBox())!;
      expect(box.width).toBe(44);
      expect(box.height).toBe(44);
    }
    await expect(composer.getByRole('button')).toHaveCount(1);
    await field.fill('');
    await expect(send).toBeDisabled();
    await expect(send.locator('svg')).toHaveClass(/lucide-corner-down-left/);
    await field.fill('   ');
    await expect(send).toBeDisabled();
    await field.fill('Keep my draft');
    await expect(send).toBeEnabled();
    await field.blur();
    await expect(mic).toBeVisible();
    await choosePreviewDevice(banner, 'Mobile');
    await expect(field).toHaveValue('Keep my draft');
    await expect(composer.getByRole('button')).toHaveCount(1);
    await mic.click();
    await expect(field).toHaveValue(/^Keep my draft Leave/);
    await choosePreviewDevice(banner, 'Window');
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
  });
}

test('the preview keeps device radio navigation without an input-style shortcut', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/');
  const windowMode = page.getByRole('radio', { name: 'Window', exact: true });
  await windowMode.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Desktop', exact: true })).toBeChecked();
  await page.getByRole('heading', { name: 'Agent', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
});

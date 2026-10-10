import { expect, test } from '@playwright/test';

test('an adaptive note overlay provides supplied responsive footer actions and restores focus', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('DialogFooter');
  const sample = page.locator('[data-kit-comparison="dialogs"] [data-kit-preview="desktop"]');
  const opener = sample.getByRole('button', { name: 'Open note review', exact: true });
  await opener.click();
  const overlay = sample.getByRole('dialog', { name: 'Keep this note?', exact: true });
  await expect(overlay).toHaveAccessibleDescription('You can change your mind later.');
  const draft = overlay.getByRole('textbox', { name: 'Note title', exact: true });
  await draft.fill('A preserved title');
  const keep = overlay.getByRole('button', { name: 'Keep note', exact: true });
  const footer = overlay.locator('[data-slot="dialog-footer"]');
  await expect(footer).toHaveCSS('flex-direction', 'row');
  await expect(footer).toHaveCSS('justify-content', 'flex-end');
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue('A preserved title');
  await keep.click();
  await expect(overlay).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(draft).toHaveValue('A preserved title');
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await expect(opener).toBeFocused();

  const phone = page.locator('[data-kit-comparison="dialogs"] [data-kit-preview="mobile"]');
  await phone.getByRole('button', { name: 'Open note review', exact: true }).click();
  const phoneOverlay = phone.getByRole('dialog', { name: 'Keep this note?', exact: true });
  await expect(phoneOverlay.locator('[data-slot="dialog-footer"]')).toHaveCSS(
    'flex-direction',
    'column-reverse',
  );
  for (const action of await phoneOverlay.getByRole('button').all()) {
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await phoneOverlay.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(phoneOverlay).toBeHidden();
  await expect(phone.getByRole('button', { name: 'Open note review', exact: true })).toBeFocused();
});

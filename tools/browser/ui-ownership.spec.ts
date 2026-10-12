import { expect, test } from '@playwright/test';
import { setPreviewMobile } from './preview-controls.ts';

test('one kit pane width token changes Chat, conversation selection and Wiki references', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 844 });
  const changeKitWidth = async () =>
    page.addStyleTag({ content: ':root, .kit-presentation { --drawer-width: 300px; }' });
  await page.goto('/preview/#/history/');
  await changeKitWidth();
  await page.keyboard.press('Control+j');
  const chat = page.getByRole('complementary', { name: 'Chat', exact: true });
  await expect(chat).toBeVisible();
  expect((await chat.boundingBox())!.width).toBe(300);
  await expect(chat.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await expect(chat.getByRole('button', { name: 'Close chat', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.getByRole('dialog', { name: 'Chat', exact: true }).boundingBox())!.width).toBe(
    390,
  );
  await page.goto('/preview/');
  await page.setViewportSize({ width: 900, height: 844 });
  await changeKitWidth();
  const chooser = page.getByRole('complementary', { name: 'Conversations', exact: true });
  await expect(chooser).toBeVisible();
  expect((await chooser.boundingBox())!.width).toBe(300);
  await page.setViewportSize({ width: 390, height: 844 });
  for (let step = 0; step < 10; step++)
    await page.locator('[data-preview-drag-handle]').press('Shift+ArrowDown');
  await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  expect(
    (await page.getByRole('dialog', { name: 'Conversations', exact: true }).boundingBox())!.width,
  ).toBe(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/wiki.html');
  await changeKitWidth();
  const preview = page.locator('[data-design-preview]');
  await preview
    .getByRole('button', { name: 'Evidence for Keep mornings free.', exact: true })
    .click();
  const references = preview.getByRole('complementary', { name: 'References', exact: true });
  await expect(references).toBeVisible();
  expect((await references.boundingBox())!.width).toBe(300);
  await setPreviewMobile(preview, true);
  const compact = preview.getByRole('dialog', { name: 'References', exact: true });
  expect((await compact.boundingBox())!.width).toBe(390);
});

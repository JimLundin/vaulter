import { expect, test } from '@playwright/test';

test('supporting content stays beside the task in expanded space and preserves its nested task on phones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 844 });
  await page.goto('/ui/kit/tests/browser.html?supporting-pane');
  const opener = page.getByRole('button', { name: 'Open supporting task', exact: true });
  await opener.click();
  const pane = page.getByRole('complementary', { name: 'Supporting task', exact: true });
  await expect(pane).toBeVisible();
  expect((await pane.boundingBox())!.width).toBe(340);
  const draft = pane.getByRole('textbox', { name: 'Retained supporting draft' });
  await draft.fill('Keep this draft across arrangements');
  const original = await draft.elementHandle();
  await pane.getByRole('button', { name: 'Review supporting task' }).click();
  const child = page.getByRole('dialog', { name: 'Task review', exact: true });
  const childDraft = child.getByRole('textbox', { name: 'Retained review draft' });
  await childDraft.fill('Keep nested review');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(childDraft).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(child).toBeHidden();
  const compact = page.getByRole('dialog', { name: 'Supporting task', exact: true });
  await expect(compact).toBeVisible();
  const bounds = (await compact.boundingBox())!;
  expect(bounds.width).toBe(390);
  expect(bounds.height).toBe(844);
  expect(bounds.y).toBe(0);
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector('[aria-label="Retained supporting draft"]'),
    ),
  ).toBe(true);
  await expect(compact.getByRole('textbox', { name: 'Retained supporting draft' })).toHaveValue(
    'Keep this draft across arrangements',
  );
  await expect(compact.getByRole('button', { name: 'Review supporting task' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(compact).toBeHidden();
  await expect(opener).toBeFocused();
});

test('closing a supporting pane in expanded space restores its opening action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 844 });
  await page.goto('/ui/kit/tests/browser.html?supporting-pane');
  const opener = page.getByRole('button', { name: 'Open supporting task', exact: true });
  await opener.click();
  const pane = page.getByRole('complementary', { name: 'Supporting task', exact: true });
  await pane.getByRole('textbox', { name: 'Retained supporting draft' }).fill('An expanded task');
  await pane.getByRole('button', { name: 'Close supporting task', exact: true }).click();
  await expect(pane).toBeHidden();
  await expect(opener).toBeFocused();
});

test('paired supporting panes keep independent scrolling content and dismiss their nested review first', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('SupportingPane');
  const family = page.locator('[data-kit-comparison="supporting-pane"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  for (const sample of [desktop, mobile])
    await sample.getByRole('button', { name: 'Open supporting pane', exact: true }).click();
  const parent = mobile.getByRole('dialog', { name: 'Supporting task', exact: true });
  await parent
    .getByRole('textbox', { name: 'Supporting draft', exact: true })
    .fill('Mobile retained content');
  await parent.getByRole('button', { name: 'Review', exact: true }).click();
  const child = mobile.getByRole('dialog', { name: 'Supporting review', exact: true });
  await child.getByRole('textbox').fill('Mobile retained review');
  await page.keyboard.press('Escape');
  await expect(child).toBeHidden();
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Review', exact: true })).toBeFocused();
  await expect(desktop.getByRole('textbox', { name: 'Supporting draft', exact: true })).toHaveValue(
    'Retained supporting content',
  );
  const scroll = parent.locator('[data-slot="scroll-area-viewport"]').first();
  await scroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(parent.getByText('Supporting line 24', { exact: true })).toBeInViewport();
  const close = parent.getByRole('button', { name: 'Close supporting task', exact: true });
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(parent).toBeHidden();
  await expect(
    mobile.getByRole('button', { name: 'Open supporting pane', exact: true }),
  ).toBeFocused();
  await expect(
    desktop.getByRole('complementary', { name: 'Supporting task', exact: true }),
  ).toBeVisible();
});

test('supporting feed scrolls above one anchored composer without losing its draft', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('SupportingPane');
  const sample = page.locator(
    '[data-kit-comparison="supporting-pane"] [data-kit-preview="mobile"]',
  );
  await sample.getByRole('button', { name: 'Use anchored feed', exact: true }).click();
  await sample.getByRole('button', { name: 'Open supporting pane', exact: true }).click();
  const pane = sample.getByRole('dialog', { name: 'Supporting task', exact: true });
  const field = pane.getByRole('textbox', { name: 'Supporting message', exact: true });
  for (let i = 0; i < 15; i++) {
    await field.fill(`Supporting message ${i + 1}`);
    await field.press('Enter');
  }
  await field.fill('Retain the next draft');
  await pane.locator('[data-slot="scroll-area-viewport"]').hover();
  const before = (await field.boundingBox())!.y - (await pane.boundingBox())!.y;
  expect(await pane.locator('[data-slot="scroll-area-viewport"]').count()).toBe(1);
  await pane.locator('[data-slot="scroll-area-viewport"]').hover();
  await page.mouse.wheel(0, -3000);
  await expect(pane.getByText('A retained supporting message.', { exact: true })).toBeInViewport();
  expect((await field.boundingBox())!.y - (await pane.boundingBox())!.y).toBe(before);
  await page.keyboard.press('Escape');
  await sample.getByRole('button', { name: 'Open supporting pane', exact: true }).click();
  await expect(field).toHaveValue('Retain the next draft');
});

test('recording blocks saved conversation selection through the production chooser', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 844 });
  await page.goto('/preview/?conversations=numbered');
  const pane = page.getByRole('complementary', { name: 'Conversations', exact: true });
  const row = pane.getByRole('button', { name: /Garden studio plans/ });
  await expect(row).toBeEnabled();
  await page.getByRole('button', { name: 'Start voice interaction', exact: true }).click();
  await expect(row).toBeDisabled();
  await expect(pane.getByRole('status')).toContainText('Finish recording');
});

test('a new selection resets the supporting body without caller access to its scroll owner', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/tests/browser.html?supporting-pane');
  await page.getByRole('button', { name: 'Open supporting task', exact: true }).click();
  const pane = page.getByRole('dialog', { name: 'Supporting task', exact: true });
  const scroll = pane.locator('[data-slot="scroll-area-viewport"]');
  await scroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(pane.getByText('Supporting line 30', { exact: true })).toBeInViewport();
  await pane.getByRole('button', { name: 'Next selection', exact: true }).click();
  await expect(pane.getByRole('textbox', { name: 'Retained supporting draft' })).toBeInViewport();
});

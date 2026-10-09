import { expect, test } from '@playwright/test';

test('the controlled Composer reports edits and each Enter or Send once without clearing its owner’s draft', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  await expect(field).toHaveAttribute('placeholder', 'Write a controlled draft');
  await field.fill('First thought');
  await field.press('Enter');
  await expect(
    page.getByText('Submitted drafts: ["First thought"]', { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue('First thought');
  await field.fill('An edited thought');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByText('Submitted drafts: ["First thought","An edited thought"]', { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue('An edited thought');
});

test('Shift+Enter and native or Safari composition keep editing in the controlled one-row field', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  await field.fill('First line');
  const before = (await field.boundingBox())!;
  await field.press('End');
  await field.press('Shift+Enter');
  await expect(field).toHaveValue('First line\n');
  await expect(field).toHaveAttribute('rows', '1');
  expect((await field.boundingBox())!.height).toBe(before.height);
  await field.fill('Composed text');
  await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await field.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
  await expect(field).toHaveValue('Composed text');
  await expect(page.getByText('Submitted drafts: []', { exact: true })).toBeVisible();
});

test('empty, whitespace and caller-denied drafts cannot submit and unhandled Enter stays an editing action', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  const send = page.getByRole('button', { name: 'Send', exact: true });
  await expect(send).toBeDisabled();
  await field.fill('   ');
  await field.press('End');
  await field.press('Enter');
  await expect(field).toHaveValue('   \n');
  await expect(send).toBeDisabled();
  await field.fill('A retained thought');
  await page.getByRole('button', { name: 'Deny submission' }).click();
  await expect(send).toBeDisabled();
  await field.press('End');
  await field.press('Enter');
  await expect(field).toHaveValue('A retained thought\n');
  // Native form submissions also go through the shared eligibility check.
  await field.evaluate((node) => node.closest('form')?.requestSubmit());
  await expect(page.getByText('Submitted drafts: []', { exact: true })).toBeVisible();
});

test('capture blocks submission and a busy response exposes only its explicit Stop action', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  await field.fill('Words to preserve');
  for (const phase of ['connecting', 'listening', 'finishing']) {
    await page.getByRole('button', { name: `${phase} capture` }).click();
    await expect(field).toHaveAttribute('readonly');
    await expect(field).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await field.dispatchEvent('keydown', { key: 'Enter', bubbles: true });
    await field.evaluate((node) => node.closest('form')?.requestSubmit());
    await expect(field).toHaveValue('Words to preserve');
  }
  await page.getByRole('button', { name: 'idle capture' }).click();
  await page.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(page.getByRole('button', { name: 'Finish recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await page.getByRole('button', { name: 'Begin response' }).click();
  await expect(field).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeDisabled();
  await field.dispatchEvent('keydown', { key: 'Enter', bubbles: true });
  await field.evaluate((node) => node.closest('form')?.requestSubmit());
  await expect(page.getByText('Stop actions: 0', { exact: true })).toBeVisible();
  await expect(page.getByText('Submitted drafts: []', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('Stop actions: 1', { exact: true })).toBeVisible();
  await expect(field).toBeEditable();
  await expect(field).toHaveValue('Words to preserve');
});

test('the supported reference focuses suggestions and focus observation matches the send icon', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  const icon = page.getByRole('button', { name: 'Send', exact: true }).locator('svg');
  await expect(icon).toHaveClass(/lucide-arrow-up/);
  await page.getByRole('button', { name: 'Use suggested thought' }).click();
  await expect(field).toHaveValue('A suggested thought');
  await expect(field).toBeFocused();
  await expect(icon).toHaveClass(/lucide-corner-down-left/);
  await expect(page.getByText('Field focused: true', { exact: true })).toBeVisible();
  await field.evaluate((node) => node.setAttribute('data-original-field', ''));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(field).toHaveAttribute('data-original-field', '');
  await expect(field).toBeFocused();
  await page.getByRole('button', { name: 'Deny submission' }).focus();
  await expect(icon).toHaveClass(/lucide-arrow-up/);
  await expect(page.getByText('Field focused: false', { exact: true })).toBeVisible();
});

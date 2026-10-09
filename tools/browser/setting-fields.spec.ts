import { expect, test } from '@playwright/test';

test('a text field owns its accessible name, description and native label activation', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  const input = page.getByRole('textbox', { name: 'Default model', exact: true });
  await expect(input).toHaveAccessibleName('Default model');
  await expect(input).toHaveAccessibleDescription('Used for new conversations.');
  await page.getByText('Default model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('explicit text identities remain valid and the visible field name takes precedence', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  const input = page.getByRole('textbox', { name: 'Identified model', exact: true });
  await expect(input).toHaveAttribute('id', 'identified-model');
  await expect(input).toHaveAccessibleDescription('An existing reference still works.');
  await page.getByText('Identified model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('nested grouped inputs retain additional descriptions without duplicate references', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  const input = page.getByRole('textbox', { name: 'Nested model', exact: true });
  await expect(input).toHaveAccessibleDescription(
    'Additional model guidance. Use the recommended model.',
  );
  const references = (await input.getAttribute('aria-describedby'))!.split(/\s+/);
  expect(references).toHaveLength(2);
  expect(new Set(references).size).toBe(2);
  await page.getByText('Nested model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('repeated labels target independent fields and preserve editing across resizing', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  const first = page.getByRole('textbox', { name: 'First repeated model', exact: true });
  const second = page.getByRole('textbox', { name: 'Second repeated model', exact: true });
  const firstIdentity = await first.getAttribute('id');
  const secondIdentity = await second.getAttribute('id');
  expect(firstIdentity).toBeTruthy();
  expect(secondIdentity).toBeTruthy();
  expect(firstIdentity).not.toBe(secondIdentity);
  await page.getByText('First repeated model', { exact: true }).click();
  await expect(first).toBeFocused();
  await first.fill('An edited value');
  for (const width of [390, 1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(first).toBeFocused();
    await expect(first).toHaveValue('An edited value');
    await expect(first).toHaveAttribute('id', firstIdentity!);
    await expect(first).toHaveAccessibleDescription('Each field keeps its own meaning.');
  }
  await page.getByText('Second repeated model', { exact: true }).click();
  await expect(second).toBeFocused();
  await expect(first).not.toBeFocused();
  await expect(second).toHaveValue('Separate value');
  await expect(second).toHaveAttribute('id', secondIdentity!);
});

test('standalone inputs retain their own identities, names and descriptions', async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  const input = page.getByRole('textbox', { name: 'Standalone model', exact: true });
  await expect(input).toHaveAttribute('id', 'standalone-model');
  await expect(input).toHaveAccessibleDescription('Standalone instructions.');
});

test('a nested textarea receives field meaning and native label activation', async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  const notes = page.getByRole('textbox', { name: 'Conversation notes', exact: true });
  await expect(notes).toHaveAccessibleDescription('Keep context for the next message.');
  await page.getByText('Conversation notes', { exact: true }).click();
  await expect(notes).toBeFocused();
});

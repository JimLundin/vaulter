import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  await page.getByRole('button', { name: 'Open field settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
});

test('a text field owns its accessible name, description and native label activation', async ({
  page,
}) => {
  const input = page.getByRole('textbox', { name: 'Default model', exact: true });
  await expect(input).toHaveAccessibleName('Default model');
  await expect(input).toHaveAccessibleDescription('Used for new conversations.');
  await page.getByText('Default model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('explicit text identities remain valid and the visible field name takes precedence', async ({
  page,
}) => {
  const input = page.getByRole('textbox', { name: 'Identified model', exact: true });
  await expect(input).toHaveAttribute('id', 'identified-model');
  await expect(input).toHaveAccessibleDescription('An existing reference still works.');
  await page.getByText('Identified model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('nested grouped inputs retain additional descriptions without duplicate references', async ({
  page,
}) => {
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
  const input = page.getByRole('textbox', { name: 'Standalone model', exact: true });
  await expect(input).toHaveAttribute('id', 'standalone-model');
  await expect(input).toHaveAccessibleDescription('Standalone instructions.');
});

test('a nested textarea receives field meaning and native label activation', async ({ page }) => {
  const notes = page.getByRole('textbox', { name: 'Conversation notes', exact: true });
  await expect(notes).toHaveAccessibleDescription('Keep context for the next message.');
  await page.getByText('Conversation notes', { exact: true }).click();
  await expect(notes).toBeFocused();
});

test('field theme choices have group meaning and standalone Appearance retains its name', async ({
  page,
}) => {
  const group = page.getByRole('radiogroup', { name: 'Field theme', exact: true });
  await expect(group).toHaveAccessibleDescription('Choose how this device looks.');
  await expect(
    group.getByRole('radio', { name: 'As the system', exact: true }),
  ).toHaveAccessibleName('As the system');
  for (const choice of ['Light', 'Dark']) {
    await expect(
      group.getByRole('radio', { name: choice, exact: true }),
    ).toHaveAccessibleDescription('');
  }
  await expect(page.getByRole('radiogroup', { name: 'Appearance', exact: true })).toBeVisible();
});

test('nested repeated groups retain independent associations and radio keyboard behavior through resizing', async ({
  page,
}) => {
  const first = page.getByRole('radiogroup', { name: 'First mode', exact: true });
  const second = page.getByRole('radiogroup', { name: 'Second mode', exact: true });
  expect(await first.getAttribute('id')).not.toBe(await second.getAttribute('id'));
  expect(await first.getAttribute('aria-describedby')).not.toBe(
    await second.getAttribute('aria-describedby'),
  );
  for (const group of [first, second]) {
    await expect(group).toHaveAccessibleDescription('Additional mode guidance. Choose one mode.');
    const references = (await group.getAttribute('aria-describedby'))!.split(/\s+/);
    expect(new Set(references).size).toBe(2);
  }
  await first.getByRole('radio', { name: 'One', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  const selected = first.getByRole('radio', { name: 'Two', exact: true });
  await expect(selected).toBeChecked();
  await expect(selected).toBeFocused();
  for (const width of [390, 1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(selected).toBeChecked();
    await expect(selected).toBeFocused();
    await expect(first).toHaveAccessibleDescription('Additional mode guidance. Choose one mode.');
  }
  await expect(second.getByRole('radio', { name: 'One', exact: true })).toBeChecked();
});

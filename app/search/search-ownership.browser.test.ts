import { expect, test } from '@playwright/test';

test('a shared command overlay accepts task labels and preserves focused query while resizing', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?command-overlay');
  const opener = page.getByRole('button', { name: 'Choose an item', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Choose an item', exact: true });
  const input = dialog.getByRole('combobox', { name: 'Item query' });
  await expect(input).toBeFocused();
  await input.fill('Second');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(input).toHaveValue('Second');
    await expect(input).toBeFocused();
    await expect(dialog.getByRole('option')).toHaveText('Second item');
  }
  await dialog.getByRole('button', { name: 'Cancel item selection' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Search preserves ranked entries and alias matches and executes supplied commands', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/search.html');
  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Search or ask' });
  const query = dialog.getByRole('combobox');
  await query.fill('studio');
  await expect(dialog.getByRole('option')).toHaveText([
    'StudioMaking room',
    'Studio notes',
    'Garden workshopstudio',
    'Ask the agent: studio',
    /Studio preferences(?:Ctrl ,|⌘,)/,
  ]);
  await query.press('ArrowDown');
  await query.press('ArrowDown');
  await query.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open Search', exact: true })).toBeFocused();
  await expect(page.getByRole('status', { name: 'Search destination' })).toHaveText('/garden/');
  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  await expect(query).toBeFocused();
  await expect(query).toHaveValue('');
  await expect(dialog.getByRole('option', { name: 'Slow mornings' })).toBeVisible();
  await expect(dialog.getByRole('option', { name: 'Hidden action' })).toHaveCount(0);
  await query.fill('preferences');
  await dialog.getByRole('option', { name: 'Studio preferences' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status', { name: 'Search action' })).toHaveText(
    'Opened preferences',
  );
});

test('Search owns ask and empty states and clears its query after dismissal', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/search.html');
  const opener = page.getByRole('button', { name: 'Open Search', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Search or ask' });
  const query = dialog.getByRole('combobox');
  await query.fill('  A quieter week  ');
  await dialog.getByRole('option', { name: 'Ask the agent: A quieter week' }).click();
  await expect(page.getByRole('status', { name: 'Search action' })).toHaveText(
    'Asked: A quieter week',
  );
  await page.getByRole('button', { name: 'Toggle ask action' }).click();
  await opener.click();
  await expect(query).toHaveValue('');
  await query.fill('unmatched query');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toHaveText('No match');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(query).toHaveValue('');
});

test('nested Search retains query selection through resizing and dismisses before its parent', async ({
  page,
}) => {
  await page.goto('/preview/search.html');
  await page.getByRole('button', { name: 'Open parent task' }).click();
  const parent = page.getByRole('dialog', { name: 'Parent task', exact: true });
  const draft = parent.getByRole('textbox', { name: 'Parent task draft' });
  await draft.fill('Continue the parent task');
  const opener = parent.getByRole('button', { name: 'Find from parent' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Search or ask' });
  const query = dialog.getByRole('combobox');
  await query.fill('studio');
  await query.press('ArrowDown');
  const selection = await query.getAttribute('aria-activedescendant');
  for (const width of [390, 768, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(query).toHaveValue('studio');
    await expect(query).toBeFocused();
    await expect(query).toHaveAttribute('aria-activedescendant', selection!);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(draft).toHaveValue('Continue the parent task');
  await page.keyboard.press('Escape');
  await expect(parent).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open parent task' })).toBeFocused();
});

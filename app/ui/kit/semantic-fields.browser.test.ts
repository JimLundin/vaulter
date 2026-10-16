import { expect, test } from '@playwright/test';

test('retained form fields expose their legend, explicit labels and supplied errors', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Forms & fields');
  const family = page.locator('[data-kit-comparison="fields"]');
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    const preferences = sample.getByRole('group', { name: 'Note preferences', exact: true });
    await expect(preferences).toBeVisible();
    const title = preferences.getByRole('textbox', { name: 'Title', exact: true });
    await preferences.getByText('Title', { exact: true }).click();
    await expect(title).toBeFocused();
    await title.fill('An edited title');
    const reminder = preferences.getByRole('checkbox', { name: 'Daily reminder', exact: true });
    await preferences.getByText('Daily reminder', { exact: true }).click();
    await expect(reminder).not.toBeChecked();
    const email = preferences.getByRole('textbox', { name: 'Email', exact: true });
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(preferences.getByRole('alert')).toHaveText('Enter a complete email address.');
    await preferences.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(preferences.getByText('Preferences saved.', { exact: true })).toBeVisible();
  }
});

test('vault access keeps labelled password entry and a contained inset submit action', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Vault access');
  const family = page.locator('[data-kit-comparison="access"]');
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    const password = sample.getByLabel('Password', { exact: true });
    await sample.getByText('Password', { exact: true }).click();
    await expect(password).toBeFocused();
    await password.fill('A retained password');
    const action = sample.getByRole('button', { name: 'Open vault', exact: true });
    const fieldBox = (await password.boundingBox())!;
    const actionBox = (await action.boundingBox())!;
    expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width);
    await expect
      .poll(async () => {
        const padding = await password.evaluate((node) =>
          Number.parseFloat(getComputedStyle(node).paddingRight),
        );
        return fieldBox.x + fieldBox.width - padding - actionBox.x;
      })
      .toBeLessThanOrEqual(-4);
    await password.press('Enter');
    await expect(password).toHaveValue('A retained password');
  }
});

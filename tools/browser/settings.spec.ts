import { expect, test } from '@playwright/test';

test('module settings persist valid preferences and keep credentials with their implementation', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  for (const name of ['Appearance', 'Chat', 'Agent', 'OpenAI', 'GitHub storage', 'Jina']) {
    await expect(settings.getByRole('region', { name, exact: true })).toBeAttached();
  }
  const agent = settings.getByRole('region', { name: 'Agent', exact: true });
  const temperature = agent.getByRole('textbox', { name: 'Temperature', exact: true });
  await temperature.fill('0.4');
  await temperature.fill('3');
  await expect(temperature).toHaveAttribute('aria-invalid', 'true');
  await expect(agent.getByRole('alert')).toContainText('Enter a valid temperature.');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('vaulter.settings.agent') ?? '{}').temperature,
      ),
    )
    .toBe('0.4');
  await temperature.fill('0.6');
  await expect(temperature).not.toHaveAttribute('aria-invalid');
  await settings
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Use concise answers.');
  const openai = settings.getByRole('region', { name: 'OpenAI', exact: true });
  await openai.getByRole('textbox', { name: 'Model', exact: true }).fill('review-model');
  await openai.getByRole('textbox', { name: 'Voice', exact: true }).fill('cedar');
  for (const label of ['OpenAI API key', 'GitHub token', 'Jina API key']) {
    const key = settings.getByLabel(label, { exact: true });
    await expect(key).toHaveAttribute('type', 'password');
    await expect(key).toHaveValue('');
    await expect(key).toBeDisabled();
    await expect(
      settings.getByRole('button', { name: `Save ${label}`, exact: true }),
    ).toBeDisabled();
  }
  await expect(settings.getByLabel('Vault repository', { exact: true })).toHaveAttribute(
    'readonly',
  );
  await expect(settings.getByLabel('OpenAI API endpoint', { exact: true })).toHaveValue(
    'https://api.openai.com/v1',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(settings.getByRole('textbox', { name: 'Model', exact: true })).toHaveValue(
    'review-model',
  );
  await expect(settings.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveValue(
    'Use concise answers.',
  );
  await expect(settings.getByRole('textbox', { name: 'Temperature', exact: true })).toHaveValue(
    '0.6',
  );
  await settings.getByRole('button', { name: 'Reset Agent to defaults', exact: true }).click();
  await expect(settings.getByRole('textbox', { name: 'Maximum steps', exact: true })).toHaveValue(
    '12',
  );
  await expect(settings.getByRole('textbox', { name: 'Temperature', exact: true })).toHaveValue('');
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});

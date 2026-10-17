import { openAppAction } from '@/ui/kit/navigation.browser.test-support.ts';
import { expect, test } from '@playwright/test';

async function reveal(settings: import('@playwright/test').Locator, title: string) {
  await settings.locator('summary').filter({ hasText: title }).click();
}

test('settings reveal customization on request, preserve overrides and reset only the chosen group', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/settings/');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const model = settings.getByRole('combobox', { name: 'Chat model', exact: true });
  const voice = settings.getByRole('combobox', { name: 'Voice', exact: true });
  await expect(model).toBeVisible();
  await expect(voice).toBeVisible();
  const instructions = settings.getByRole('textbox', { name: 'Instructions', exact: true });
  const steps = settings.getByRole('combobox', { name: 'Maximum steps', exact: true });
  const voiceModel = settings.getByRole('combobox', { name: 'Voice model', exact: true });
  await expect(instructions).toBeHidden();
  await expect(steps).toBeHidden();
  await expect(voiceModel).toBeHidden();
  for (const label of ['Top K', 'Presence penalty', 'Frequency penalty', 'Stop sequences', 'Seed'])
    await expect(settings.getByLabel(label, { exact: true })).toHaveCount(0);
  await model.selectOption({ label: 'Custom…' });
  await settings
    .getByRole('textbox', { name: 'Custom chat model', exact: true })
    .fill('review-model');
  await voice.selectOption('cedar');
  await reveal(settings, 'Customize instructions');
  await instructions.fill('Keep the sources.');
  await reveal(settings, 'Customize instructions');
  await expect(
    settings.locator('summary').filter({ hasText: 'Customize instructions' }),
  ).toContainText('1 customized');
  await reveal(settings, 'Run limits');
  await steps.selectOption('20');
  const output = settings.getByRole('combobox', { name: 'Maximum output tokens', exact: true });
  await output.selectOption({ label: 'Custom…' });
  const custom = settings.getByRole('textbox', {
    name: 'Custom maximum output tokens',
    exact: true,
  });
  await custom.fill('0');
  await expect(custom).toHaveAttribute('aria-invalid', 'true');
  await custom.fill('1536');
  await expect(custom).not.toHaveAttribute('aria-invalid');
  await reveal(settings, 'Troubleshooting');
  await settings.getByRole('combobox', { name: 'Maximum retries', exact: true }).selectOption('3');
  await reveal(settings, 'Voice and transcription models');
  await voiceModel.selectOption('gpt-realtime-2.1-mini');
  await page.reload();
  await expect(model.locator('option:checked')).toHaveText('Custom…');
  await expect(
    settings.getByRole('textbox', { name: 'Custom chat model', exact: true }),
  ).toHaveValue('review-model');
  await expect(voice).toHaveValue('cedar');
  await expect(instructions).toBeHidden();
  await expect(settings.locator('summary').filter({ hasText: 'Run limits' })).toContainText(
    '2 customized',
  );
  await reveal(settings, 'Run limits');
  await expect(steps).toHaveValue('20');
  await expect(custom).toHaveValue('1536');
  await settings.getByRole('button', { name: 'Reset Run limits to defaults', exact: true }).click();
  await expect(steps).toHaveValue('12');
  await expect(output).toHaveValue('');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('vaulter.settings.agent') ?? '{}')),
    )
    .toEqual({ maxRetries: '3' });
  await reveal(settings, 'Voice and transcription models');
  await settings
    .getByRole('button', { name: 'Reset Voice and transcription models to defaults', exact: true })
    .click();
  await expect(voice).toHaveValue('cedar');
  await expect(
    settings.getByRole('textbox', { name: 'Custom chat model', exact: true }),
  ).toHaveValue('review-model');
  await model.selectOption('gpt-6-astra');
  await expect(
    settings.locator('summary').filter({ hasText: 'Advanced model tuning' }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(settings).toHaveCount(0);
});

test('connection editors and installation details reveal explicitly and disclose disabled preview credentials', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await openAppAction(page, 'Settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  for (const [title, label] of [
    ['Manage OpenAI connection', 'OpenAI API key'],
    ['Manage GitHub connection', 'GitHub token'],
  ]) {
    const editor = settings.getByLabel(label!, { exact: true });
    await expect(editor).toBeHidden();
    const trigger = settings.locator('summary').filter({ hasText: title! });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(editor).toBeVisible();
    await expect(editor).toBeDisabled();
    await expect(editor).toHaveValue('');
    await expect(editor).toHaveAttribute('type', 'password');
  }
  await reveal(settings, 'OpenAI connection details');
  await expect(settings.getByText('https://api.openai.com/v1', { exact: true })).toBeVisible();
  await expect(
    settings.getByRole('button', { name: 'Copy OpenAI API endpoint', exact: true }),
  ).toBeVisible();
});

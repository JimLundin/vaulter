import { expect, test } from '@playwright/test';
import { openAppAction } from '@/shared/ui/kit/navigation.browser.test-support.ts';

test('grouped settings persist selectors, instructions and endpoints after reload', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/settings/');
  const d = page.getByRole('dialog', { name: 'Settings', exact: true });
  await d.getByRole('radio', { name: /Balanced/ }).click();
  await d.getByRole('radio', { name: 'cedar', exact: true }).click();
  await d.getByRole('button', { name: 'Edit', exact: true }).click();
  await d.getByRole('textbox', { name: 'Instructions', exact: true }).fill('Use concise answers.');
  await d.getByRole('button', { name: 'Adjust', exact: true }).click();
  await d.getByRole('combobox', { name: 'Maximum steps', exact: true }).selectOption('20');
  await d
    .getByRole('combobox', { name: 'Maximum output tokens', exact: true })
    .selectOption('2048');
  await d
    .getByRole('region', { name: 'Voice models', exact: true })
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  await d
    .getByRole('combobox', { name: 'Voice model', exact: true })
    .selectOption('gpt-realtime-2.1-mini');
  await d
    .getByRole('combobox', { name: 'Live transcription model', exact: true })
    .selectOption('gpt-realtime-whisper');
  await d
    .getByRole('combobox', { name: 'File transcription model', exact: true })
    .selectOption('gpt-4o-mini-transcribe');
  await d.locator('summary').filter({ hasText: 'Troubleshooting' }).click();
  await d.getByRole('combobox', { name: 'Maximum retries', exact: true }).selectOption('3');
  const endpoint = d
    .getByRole('region', { name: 'OpenAI', exact: true })
    .locator('input[type=url]');
  await endpoint.fill('https://example.test/openai/v1');
  await d
    .getByRole('region', { name: 'OpenAI', exact: true })
    .getByRole('button', { name: 'Save endpoint', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('vaulter.settings.openai') ?? '{}').api),
    )
    .toBe('https://example.test/openai/v1');
  await page.reload();
  await expect(d.getByRole('radio', { name: /Balanced/ })).toBeChecked();
  await expect(d.getByRole('radio', { name: 'cedar', exact: true })).toBeChecked();
  await expect(endpoint).toHaveValue('https://example.test/openai/v1');
  await d.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(d.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveValue(
    'Use concise answers.',
  );
  await d.getByRole('button', { name: 'Adjust', exact: true }).click();
  await expect(d.getByRole('combobox', { name: 'Maximum steps', exact: true })).toHaveValue('20');
  await expect(d.getByRole('combobox', { name: 'Maximum output tokens', exact: true })).toHaveValue(
    '2048',
  );
  await d
    .getByRole('region', { name: 'Voice models', exact: true })
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  await expect(d.getByRole('combobox', { name: 'Voice model', exact: true })).toHaveValue(
    'gpt-realtime-2.1-mini',
  );
  await expect(
    d.getByRole('combobox', { name: 'Live transcription model', exact: true }),
  ).toHaveValue('gpt-realtime-whisper');
  await expect(
    d.getByRole('combobox', { name: 'File transcription model', exact: true }),
  ).toHaveValue('gpt-4o-mini-transcribe');
  await d.getByRole('button', { name: 'Restore default models', exact: true }).click();
  await expect(d.getByRole('radio', { name: 'cedar', exact: true })).toBeChecked();
  await expect(endpoint).toHaveValue('https://example.test/openai/v1');
});

test('comparison cycles only grouped layouts without reloading or remounting the app', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/?compare=settings&variant=cards#/chat/');
  const message = page.getByRole('textbox', { name: 'Message', exact: true });
  await message.fill('Keep this conversation draft');
  await message.evaluate((node) => node.setAttribute('data-retained', 'yes'));
  await page.evaluate(() => {
    Object.assign(window, { retainedPage: 'yes' });
  });
  await openAppAction(page, 'Settings');
  const d = page.getByRole('dialog', { name: 'Settings', exact: true });
  await d.getByRole('radio', { name: 'cedar', exact: true }).click();
  const mobileControls = page.getByRole('button', { name: 'Preview controls', exact: true });
  if (await mobileControls.isVisible()) await mobileControls.click();
  await page.getByRole('button', { name: 'Next design', exact: true }).click();
  await expect(d).toBeVisible();
  await expect(d.getByRole('radio', { name: 'cedar', exact: true })).toBeChecked();
  expect(await page.evaluate(() => Reflect.get(window, 'retainedPage'))).toBe('yes');
  await d.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(message).toHaveValue('Keep this conversation draft');
  await expect(message).toHaveAttribute('data-retained', 'yes');
});

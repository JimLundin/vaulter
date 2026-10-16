import { openAppAction, expectAppActionFocus } from '../ui/kit/navigation.browser.test-support.ts';
import { expect, test } from '@playwright/test';

test('module settings persist valid preferences and keep credentials with their implementation', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await openAppAction(page, 'Settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  for (const name of ['Appearance', 'Chat', 'Agent', 'OpenAI', 'GitHub storage']) {
    await expect(settings.getByRole('region', { name, exact: true })).toBeAttached();
  }
  const agent = settings.getByRole('region', { name: 'Agent', exact: true });
  for (const label of ['Maximum steps', 'Maximum output tokens', 'Maximum retries'])
    await expect(agent.getByRole('combobox', { name: label, exact: true })).toBeAttached();
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
  const instructions = settings.getByRole('textbox', { name: 'Instructions', exact: true });
  await instructions.fill('Use concise answers.');
  await instructions.press('End');
  await instructions.press('Enter');
  await expect(instructions).toHaveValue('Use concise answers.');
  await instructions.press('Shift+Enter');
  await expect(instructions).toHaveValue('Use concise answers.\n');
  await instructions.pressSequentially('Keep the sources.');
  const openai = settings.getByRole('region', { name: 'OpenAI', exact: true });
  for (const label of [
    'Model',
    'Voice model',
    'Live transcription model',
    'File transcription model',
    'Voice',
  ])
    await expect(openai.getByRole('combobox', { name: label, exact: true })).toBeAttached();
  const model = openai.getByRole('combobox', { name: 'Model', exact: true });
  const initialModel = await model.inputValue();
  await model.selectOption({ label: 'Custom…' });
  const customModel = openai.getByRole('textbox', { name: 'Custom model', exact: true });
  await customModel.fill('review-model');
  await openai.getByRole('combobox', { name: 'Voice', exact: true }).selectOption('cedar');
  for (const label of ['OpenAI API key', 'GitHub token']) {
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
  await openAppAction(page, 'Settings');
  await expect(model.locator('option:checked')).toHaveText('Custom…');
  await expect(customModel).toHaveValue('review-model');
  await expect(settings.getByRole('combobox', { name: 'Voice', exact: true })).toHaveValue('cedar');
  await expect(instructions).toHaveValue('Use concise answers.\nKeep the sources.');
  await expect(settings.getByRole('textbox', { name: 'Temperature', exact: true })).toHaveValue(
    '0.6',
  );
  await model.selectOption('gpt-6.1-sol');
  await expect(customModel).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('vaulter.settings.openai') ?? '{}').model,
      ),
    )
    .toBe('gpt-6.1-sol');
  await settings.getByRole('button', { name: 'Reset OpenAI to defaults', exact: true }).click();
  await expect(model).toHaveValue(initialModel);
  await expect(customModel).toHaveCount(0);
  await expect(settings.getByRole('combobox', { name: 'Voice', exact: true })).toHaveValue('marin');
  await settings.getByRole('button', { name: 'Reset Agent to defaults', exact: true }).click();
  await expect(settings.getByRole('combobox', { name: 'Maximum steps', exact: true })).toHaveValue(
    '12',
  );
  await expect(settings.getByRole('textbox', { name: 'Temperature', exact: true })).toHaveValue('');
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expectAppActionFocus(page, 'Settings');
});

test('Agent presets retain custom numeric drafts and provide explicit model and provider defaults', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/settings/');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const agent = settings.getByRole('region', { name: 'Agent', exact: true });
  const steps = agent.getByRole('combobox', { name: 'Maximum steps', exact: true });
  const output = agent.getByRole('combobox', { name: 'Maximum output tokens', exact: true });
  const retries = agent.getByRole('combobox', { name: 'Maximum retries', exact: true });
  for (const [label, control] of [
    ['Maximum steps', steps],
    ['Maximum output tokens', output],
    ['Maximum retries', retries],
  ] as const) {
    await agent.getByText(label, { exact: true }).click();
    await expect(control).toBeFocused();
  }
  await steps.selectOption('20');
  await output.selectOption('256');
  await retries.selectOption('0');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('vaulter.settings.agent') ?? '{}')),
    )
    .toEqual({ maxSteps: '20', maxOutputTokens: '256', maxRetries: '0' });
  await output.selectOption({ label: 'Custom…' });
  const customOutput = agent.getByRole('textbox', {
    name: 'Custom maximum output tokens',
    exact: true,
  });
  await expect(customOutput).toHaveValue('');
  await expect(customOutput).toHaveAttribute('inputmode', 'decimal');
  await agent.getByText('Custom maximum output tokens', { exact: true }).click();
  await expect(customOutput).toBeFocused();
  await customOutput.fill('0');
  await expect(customOutput).toHaveAttribute('aria-invalid', 'true');
  await expect(agent.getByRole('alert')).toContainText('Enter a valid maximum output tokens.');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('vaulter.settings.agent') ?? '{}').maxOutputTokens,
      ),
    )
    .toBe('256');
  await customOutput.fill('1536');
  await expect(customOutput).not.toHaveAttribute('aria-invalid');
  await page.reload();
  await expect(steps).toHaveValue('20');
  await expect(output.locator('option:checked')).toHaveText('Custom…');
  await expect(customOutput).toHaveValue('1536');
  await expect(retries).toHaveValue('0');
  await output.selectOption({ label: 'Model default' });
  await retries.selectOption({ label: 'Provider default' });
  await expect(customOutput).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('vaulter.settings.agent') ?? '{}')),
    )
    .toEqual({ maxSteps: '20' });
  await page.reload();
  await expect(output).toHaveValue('');
  await expect(retries).toHaveValue('');
  await settings.getByRole('button', { name: 'Reset Agent to defaults', exact: true }).click();
  await expect(steps).toHaveValue('12');
  await expect(output).toHaveValue('');
  await expect(retries).toHaveValue('');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('vaulter.settings.agent')))
    .toBeNull();
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(settings).toHaveCount(0);
});

test('model and voice dropdowns support labels, native selection and custom IDs', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/settings/');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const model = settings.getByRole('combobox', { name: 'Model', exact: true });
  await settings.getByText('Model', { exact: true }).click();
  await expect(model).toBeFocused();
  await model.selectOption('gpt-6.1-sol');
  const voice = settings.getByRole('combobox', { name: 'Voice', exact: true });
  await settings.getByText('Voice', { exact: true }).click();
  await expect(voice).toBeFocused();
  await page.keyboard.press('Home');
  const firstVoice = await voice.inputValue();
  await page.keyboard.press('ArrowDown');
  await expect(voice).not.toHaveValue(firstVoice);
  await voice.selectOption('cedar');
  await expect(voice).toHaveValue('cedar');
  await model.selectOption({ label: 'Custom…' });
  const customModel = settings.getByRole('textbox', { name: 'Custom model', exact: true });
  await expect(customModel).toHaveValue('');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('vaulter.settings.openai') ?? '{}').model,
      ),
    )
    .toBe('gpt-6.1-sol');
  await customModel.fill('   ');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('vaulter.settings.openai') ?? '{}').model,
      ),
    )
    .toBe('gpt-6.1-sol');
  await settings.getByText('Custom model', { exact: true }).click();
  await expect(customModel).toBeFocused();
  await customModel.fill('installation-model');
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  await openAppAction(page, 'Settings');
  await expect(model.locator('option:checked')).toHaveText('Custom…');
  await expect(customModel).toHaveValue('installation-model');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

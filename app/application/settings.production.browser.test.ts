import { expect, test } from '@playwright/test';
import { openAppAction } from '@/shared/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { seal } from '@/core/session/sealed.ts';

test('production settings retain explicit preferences after login and reload', async ({ page }) => {
  const password = 'fictional-settings-password';
  const sealed = await seal(
    { github: 'fictional-token', openai: 'fictional-key' },
    password,
    undefined,
    1000,
  );
  const fake = await fakeGitHub({});
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const response = await fake.fetchFn(
      request.url().replace('https://api.github.com', 'https://gh.test'),
      {
        method: request.method(),
        headers: request.headers(),
        body: request.postData(),
      },
    );
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers),
    });
  });
  await page.goto('/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await openAppAction(page, 'Settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const voice = settings.getByRole('radio', { name: 'cedar', exact: true });
  await voice.click();
  await settings.getByRole('button', { name: 'Adjust', exact: true }).click();
  const steps = settings.getByRole('combobox', { name: 'Maximum steps', exact: true });
  await steps.selectOption('20');
  await settings
    .getByRole('region', { name: 'Voice models', exact: true })
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  await settings
    .getByRole('combobox', { name: 'Voice model', exact: true })
    .selectOption('gpt-realtime-2.1-mini');
  const endpoint = settings
    .getByRole('region', { name: 'OpenAI', exact: true })
    .locator('input[type=url]');
  await endpoint.fill('https://compatible.test/v1');
  await settings
    .getByRole('region', { name: 'OpenAI', exact: true })
    .getByRole('button', { name: 'Save endpoint', exact: true })
    .click();
  await settings.getByRole('button', { name: 'Change OpenAI credential', exact: true }).click();
  const key = settings.getByLabel('OpenAI API key', { exact: true });
  await key.fill('replacement-key');
  await settings.getByRole('button', { name: 'Save OpenAI API key', exact: true }).click();
  await expect(key).toHaveValue('');
  await page.reload();
  await openAppAction(page, 'Settings');
  await expect(voice).toBeChecked();
  await expect(endpoint).toHaveValue('https://compatible.test/v1');
  await settings.getByRole('button', { name: 'Adjust', exact: true }).click();
  await expect(steps).toHaveValue('20');
  await settings
    .getByRole('region', { name: 'Voice models', exact: true })
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  await expect(settings.getByRole('combobox', { name: 'Voice model', exact: true })).toHaveValue(
    'gpt-realtime-2.1-mini',
  );
  await settings.getByRole('button', { name: 'Change OpenAI credential', exact: true }).click();
  await expect(
    settings
      .getByRole('region', { name: 'OpenAI', exact: true })
      .getByText('Custom value', { exact: true })
      .first(),
  ).toBeVisible();
  await expect(key).toHaveValue('');
});

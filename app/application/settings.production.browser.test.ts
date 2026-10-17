import { expect, test } from '@playwright/test';
import { openAppAction } from '@/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/vault/storage/github-client/fake-github.ts';
import { seal } from '@/vault/session/sealed.ts';

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
  const voice = settings.getByRole('combobox', { name: 'Voice', exact: true });
  await voice.selectOption('cedar');
  const steps = settings.getByRole('combobox', { name: 'Maximum steps', exact: true });
  await expect(steps).toBeHidden();
  await settings.locator('summary').filter({ hasText: 'Run limits' }).click();
  await steps.selectOption('20');
  const key = settings.getByLabel('OpenAI API key', { exact: true });
  await expect(key).toBeHidden();
  await settings.locator('summary').filter({ hasText: 'Manage OpenAI connection' }).click();
  await expect(key).toBeEnabled();
  await expect(key).toHaveValue('');
  await page.reload();
  await openAppAction(page, 'Settings');
  await expect(voice).toHaveValue('cedar');
  await expect(steps).toBeHidden();
  await expect(settings.locator('summary').filter({ hasText: 'Run limits' })).toContainText(
    '1 customized',
  );
  await settings.locator('summary').filter({ hasText: 'Run limits' }).click();
  await expect(steps).toHaveValue('20');
});

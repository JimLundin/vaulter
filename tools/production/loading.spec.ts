import { expect, test } from '@playwright/test';
import { sampleFiles } from '../../app/preview/data.ts';
import { seal } from '../../app/vault/session/sealed.ts';
import { fakeGitHub } from '../../app/vault/storage/github-client/fake-github.ts';

test('vault loading stays visible through credentials and data fetches, then opens the app', async ({
  page,
}) => {
  const fake = await fakeGitHub(sampleFiles);
  const password = 'fictional-loading-password';
  const sealed = await seal({ github: 'fictional-token' }, password, undefined, 1000);
  let releaseCredentials!: () => void;
  const credentialsReady = new Promise<void>((resolve) => {
    releaseCredentials = resolve;
  });
  let releaseData!: () => void;
  const dataReady = new Promise<void>((resolve) => {
    releaseData = resolve;
  });
  await page.route('**/secrets.json', async (route) => {
    await credentialsReady;
    await route.fulfill({ json: sealed });
  });
  await page.route('https://api.github.com/**', async (route) => {
    await dataReady;
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
  try {
    await page.goto('/#/chat/');
    const title = page.getByRole('heading', { name: 'Opening your vault', exact: true });
    const status = page.getByRole('status').filter({ hasText: 'Loading your vault…' });
    await expect(title).toBeVisible();
    await expect(status).toBeVisible();
    await expect(page.getByText('Vaulter', { exact: true })).toBeVisible();
    await expect(status.locator('svg')).toHaveCSS('animation-name', 'spin');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(status.locator('svg')).toHaveCSS('animation-name', 'none');
    releaseCredentials();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await expect(title).toHaveCount(0);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
    await expect(title).toBeVisible();
    await expect(status).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
    releaseData();
    await expect(title).toHaveCount(0);
    await expect(status).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
  } finally {
    releaseCredentials();
    releaseData();
  }
});

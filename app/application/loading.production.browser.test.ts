import { expect, test } from '@playwright/test';
import { seal } from '@/application/session/sealed.ts';
import { fakeGitHub } from '@/application/persistence/github-client/fake-github.ts';

test('startup stays visible before JavaScript loads and hands over to the React loader', async ({
  page,
}) => {
  const sealed = await seal({ github: 'fictional-token' }, 'fictional-password', undefined, 1000);
  let releaseScript!: () => void;
  const scriptReady = new Promise<void>((resolve) => {
    releaseScript = resolve;
  });
  let releaseCredentials!: () => void;
  const credentialsReady = new Promise<void>((resolve) => {
    releaseCredentials = resolve;
  });
  await page.route('**/*.js', async (route) => {
    await scriptReady;
    await route.continue();
  });
  await page.route('**/secrets.json', async (route) => {
    await credentialsReady;
    await route.fulfill({ json: sealed });
  });
  try {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
    await page.goto('/#/chat/', { waitUntil: 'commit' });
    const startup = page.locator('.kit-startup');
    const status = page.getByRole('status').filter({ hasText: 'Loading your vault…' });
    await expect(startup).toBeVisible();
    await expect(startup.getByRole('heading', { name: 'Opening your vault' })).toBeVisible();
    await expect(status).toBeVisible();
    await expect(status.locator('svg')).toHaveCSS('animation-name', 'kit-loading-spin');
    await expect(startup).toHaveCSS('background-color', 'rgb(9, 9, 11)');
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await expect(startup).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(status.locator('svg')).toHaveCSS('animation-name', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    releaseScript();
    await expect(startup).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Opening your vault' })).toBeVisible();
    await expect(status).toBeVisible();
    await expect(status.locator('svg')).toHaveCSS('animation-name', 'none');
    releaseCredentials();
    await expect(status).toHaveCount(0);
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  } finally {
    releaseScript();
    releaseCredentials();
  }
});

test('EAV startup ignores unrelated files and stays visible through credentials and data fetches', async ({
  page,
}) => {
  const fake = await fakeGitHub({
    'meta/schema.yaml': 'invalid: [',
    'Legacy.md': '# Not application data',
  });
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
    await expect(status.locator('svg')).toHaveCSS('animation-name', 'kit-loading-spin');
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
    expect(fake.state.calls.some((call) => call.startsWith('GET /git/blobs/'))).toBe(false);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await page.route('https://api.github.com/**', (route) => route.abort('internetdisconnected'));
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'onLine', { get: () => false }),
    );
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  } finally {
    releaseCredentials();
    releaseData();
  }
});

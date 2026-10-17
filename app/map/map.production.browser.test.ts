import { expect, test } from '@playwright/test';
import { navigateToModule } from '@/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/vault/storage/github-client/fake-github.ts';
import { seal } from '@/vault/session/sealed.ts';

test('production Map attaches coordinates to a record, reloads and removes them', async ({
  page,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  const fake = await fakeGitHub({});
  const password = 'fictional-calendar-password';
  const sealed = await seal({ github: 'fictional-token' }, password, undefined, 1000);
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const response = await fake.fetchFn(
      req.url().replace('https://api.github.com', 'https://gh.test'),
      { method: req.method(), headers: req.headers(), body: req.postData() },
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
  await navigateToModule(page, 'Calendar');
  await page.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByLabel('Event title', { exact: true }).fill('Meeting place');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigateToModule(page, 'Map');
  await page.getByRole('button', { name: 'Add coordinates', exact: true }).click();
  await page
    .getByLabel('Attach to record', { exact: true })
    .selectOption({ label: 'Meeting place' });
  await page.getByLabel('Latitude', { exact: true }).fill('59.3293');
  await page.getByLabel('Longitude', { exact: true }).fill('18.0686');
  await page.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
  await page.reload();
  if (await page.getByLabel('Password', { exact: true }).isVisible()) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  }
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
  await page.locator('.leaflet-marker-icon').click();
  await expect(page.getByRole('heading', { name: 'Meeting place', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove coordinates', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove coordinates', exact: true })
    .click();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
});

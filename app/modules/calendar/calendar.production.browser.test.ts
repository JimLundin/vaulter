import { expect, test } from '@playwright/test';
import { navigateToModule } from '@/shared/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { seal } from '@/core/session/sealed.ts';

test('production Calendar accepts a user event through EAV and retains it after reload', async ({
  page,
}) => {
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
  const header = page.getByRole('toolbar', { name: 'Calendar', exact: true });
  await expect(header.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  expect((await header.boundingBox())?.height).toBe(48);
  await expect(page.getByRole('button', { name: 'Add event', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByLabel('Event title', { exact: true }).fill('A future studio visit');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (await page.getByRole('button', { name: 'Open timeline', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open timeline', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Date unknown', exact: true })
      .getByRole('heading', { name: 'A future studio visit' }),
  ).toBeVisible();
  await page.reload();
  if (await page.getByLabel('Password', { exact: true }).isVisible()) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  }
  await expect(header.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Open timeline', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open timeline', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Date unknown', exact: true })
      .getByRole('heading', { name: 'A future studio visit' }),
  ).toBeVisible();
});

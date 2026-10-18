import { expect, test } from '@playwright/test';
import { navigateToModule } from '@/shared/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { seal } from '@/core/session/sealed.ts';

test('production Decisions creates, revises and removes the same retained record across reload', async ({
  page,
}) => {
  const fake = await fakeGitHub({});
  const password = 'fictional-decision-password';
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
  await navigateToModule(page, 'Decisions');
  await expect(page.getByRole('button', { name: 'Add decision', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add decision', exact: true }).click();
  await page.getByLabel('Decision text', { exact: true }).fill('Keep studio visits informal');
  await page.getByLabel('Decision date (optional)', { exact: true }).fill('2026-10-12');
  await page.getByLabel('Rationale (optional)', { exact: true }).fill('Time to talk with everyone');
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Keep studio visits informal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Keep studio visits informal', exact: true }).click();
  await page.getByLabel('Decision text', { exact: true }).fill('Keep studio visits relaxed');
  await page.getByLabel('Decision date (optional)', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  if (await page.getByLabel('Password', { exact: true }).isVisible()) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  }
  await expect(page.getByText('Keep studio visits relaxed', { exact: true })).toBeVisible();
  await expect(page.getByText('Time to talk with everyone', { exact: true })).toBeVisible();
  await expect(page.getByText('Date not recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('Keep studio visits informal', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Remove Keep studio visits relaxed', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove decision', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('No decisions recorded.', { exact: true })).toBeVisible();
});

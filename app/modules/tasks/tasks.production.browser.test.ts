import { expect, test } from '@playwright/test';
import { navigateToModule } from '@/shared/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { seal } from '@/core/session/sealed.ts';

test('production Tasks creates, moves and edits a task with civil due date through durable EAV', async ({
  page,
}) => {
  const fake = await fakeGitHub({});
  const password = 'fictional-tasks-password';
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
  await navigateToModule(page, 'Tasks');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Prepare the exhibition');
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-24');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const task = () => page.getByRole('region', { name: 'Prepare the exhibition', exact: true });
  await expect(
    page
      .getByRole('region', { name: 'Backlog', exact: true })
      .getByRole('heading', { name: 'Prepare the exhibition' }),
  ).toBeVisible();
  await task()
    .getByLabel('Move Prepare the exhibition', { exact: true })
    .selectOption('in-progress');
  await expect(
    page
      .getByRole('region', { name: 'In progress', exact: true })
      .getByRole('heading', { name: 'Prepare the exhibition' }),
  ).toBeVisible();
  await task().getByRole('button', { name: 'Edit Prepare the exhibition', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Prepare the autumn exhibition');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  if (await page.getByLabel('Password', { exact: true }).isVisible()) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  }
  const retained = page.getByRole('region', { name: 'Prepare the autumn exhibition', exact: true });
  await expect(retained).toBeVisible();
  await expect(retained.getByText('In progress · Due 2026-10-24', { exact: true })).toBeVisible();
  await retained
    .getByLabel('Move Prepare the autumn exhibition', { exact: true })
    .selectOption('cancelled');
  await expect(
    page
      .getByRole('region', { name: 'Cancelled and abandoned tasks', exact: true })
      .getByRole('heading', { name: 'Prepare the autumn exhibition' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Done', exact: true })
      .getByRole('heading', { name: 'Prepare the autumn exhibition' }),
  ).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { fakeGitHub } from '../../storage/github-client/fake-github.ts';
import { create, request } from '../../nodes/fixtures.test-support.ts';
import { accept } from '../../nodes/history.ts';
import { canonical, digest } from '../../nodes/json.ts';
import { seal } from '../../session/sealed.ts';

test('production History displays historical attribution and records confirmed content compensation', async ({
  page,
}) => {
  const initial = request('history-fixture', [
    create('user', { kind: 'actor', name: 'Original owner' }),
    create('content', { kind: 'content', title: 'Quiet mornings', text: 'Leave room for a walk.' }),
  ]);
  const initialRecord = accept(
    [],
    initial,
    await digest(canonical(initial)),
    '2026-10-11T09:00:00Z',
  );
  const edit = {
    ...request('content-edit', [
      {
        ...create('content', {
          kind: 'content',
          title: 'Quiet mornings',
          text: 'Leave room for a longer walk.',
        }),
        expected: 'history-fixture',
      },
    ]),
    message: 'Lengthen the morning walk',
  };
  const editRecord = accept(
    [initialRecord],
    edit,
    await digest(canonical(edit)),
    '2026-10-11T09:05:00Z',
  );
  const rename = request('rename-author', [
    { ...create('user', { kind: 'actor', name: 'Current owner' }), expected: 'history-fixture' },
  ]);
  const renameRecord = accept(
    [initialRecord, editRecord],
    rename,
    await digest(canonical(rename)),
    '2026-10-11T09:10:00Z',
  );
  const fake = await fakeGitHub({
    '.vaulter/nodes/v1/transactions/history-fixture.json': JSON.stringify(initialRecord),
    '.vaulter/nodes/v1/transactions/content-edit.json': JSON.stringify(editRecord),
    '.vaulter/nodes/v1/transactions/rename-author.json': JSON.stringify(renameRecord),
  });
  const password = 'fictional-history-password';
  const sealed = await seal({ github: 'fictional-token' }, password, undefined, 1000);
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const response = await fake.fetchFn(
      req.url().replace('https://api.github.com', 'https://gh.test'),
      {
        method: req.method(),
        headers: req.headers(),
        body: req.postData(),
      },
    );
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers),
    });
  });
  await page.goto('/#/history/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  const title = page.getByRole('button', { name: 'Lengthen the morning walk', exact: true });
  const row = page.getByRole('region', { name: 'Lengthen the morning walk', exact: true });
  await expect(row).toContainText('Original owner');
  await expect(row).not.toContainText('Current owner');
  await expect(row.getByText('#2', { exact: true })).toBeVisible();
  await title.click();
  await expect(row.getByText('Updated content: Quiet mornings', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Undo transaction #2', exact: true }).click();
  const review = page.getByRole('dialog', {
    name: 'Undo “Lengthen the morning walk”?',
    exact: true,
  });
  await review.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(review).toBeHidden();
  await expect(page.getByRole('button', { name: 'Undo content-edit', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo content-edit', exact: true })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { createPersistentStorage, openDatabase, type Journal } from '../../vault/eav/index.ts';
import { applicationSchema } from '../../application/composition.ts';
import { seedEavWiki } from '../../preview/wiki-records.ts';
import { fakeGitHub } from '../../vault/storage/github-client/fake-github.ts';
import { seal } from '../../vault/session/sealed.ts';

test('production Wiki reads typed EAV prose and retained citations after reload', async ({
  page,
}) => {
  const files: Record<string, string> = {};
  let journal: Journal = { schemas: [], commits: [] };
  const scope = JSON.stringify([
    'https://api.github.com',
    'JimLundin',
    'vault',
    'main',
    '.vaulter/eav/transactions/',
  ]);
  const storage = createPersistentStorage({
    scope,
    load: () => Promise.resolve(journal),
    append: (request) => {
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
      files[`.vaulter/eav/transactions/${encodeURIComponent(request.commit.id)}.json`] =
        JSON.stringify(request);
      return Promise.resolve();
    },
  });
  await using db = await openDatabase({ schema: applicationSchema, storage });
  await seedEavWiki(db);
  const fake = await fakeGitHub(files);
  const password = 'fictional-wiki-password';
  const sealed = await seal({ github: 'fictional-token' }, password, undefined, 1000);
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const response = await fake.fetchFn(
      request.url().replace('https://api.github.com', 'https://gh.test'),
      { method: request.method(), headers: request.headers(), body: request.postData() },
    );
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers),
    });
  });
  await page.goto('/#/wiki/preview%3Apage%3A0/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  await expect(page.getByText('Needs reference', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Evidence for Keep mornings free.', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Studio plans', exact: true })).toBeVisible();
  await expect(
    page.getByText('Source has a newer version. This excerpt stays tied to the original.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Evidence for Keep mornings free.', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Studio plans', exact: true })).toBeVisible();
  for (const [path, bytes] of Object.entries(files)) expect(fake.filesAt()[path]).toBe(bytes);
});

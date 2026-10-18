import { expect, test } from '@playwright/test';
import { createPersistentStorage, openDatabase, type Journal } from '@/core/store/index.ts';
import { applicationSchema } from '@/application/composition/composition.ts';
import { seedEavWiki } from '@/preview/wiki-records.ts';
import { seedEavQuestions } from '@/preview/question-records.ts';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { seal } from '@/core/session/sealed.ts';

test('production shares EAV questions with Wiki and persists an explicit answer after reload', async ({
  page,
}) => {
  const files: Record<string, string> = {};
  let journal: Journal = { schemas: [], commits: [] };
  const storage = createPersistentStorage({
    scope: JSON.stringify([
      'https://api.github.com',
      'JimLundin',
      'vault',
      'main',
      '.vaulter/eav/transactions/',
    ]),
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
  await seedEavQuestions(db);
  const fake = await fakeGitHub(files);
  const password = 'fictional-questions-password';
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
  await page.goto('/#/questions/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Which tools should stay?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep hand tools close', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('Keep the hand plane.');
  await page.getByRole('textbox', { name: 'Your answer', exact: true }).press('Enter');
  await expect(page.getByText('No open questions.', { exact: true })).toBeVisible();
  await page.goto('/#/wiki/preview%3Apage%3A0/');
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(
    'Keep the hand plane.',
  );
  await page.reload();
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(
    'Keep the hand plane.',
  );
  for (const [path, bytes] of Object.entries(files)) expect(fake.filesAt()[path]).toBe(bytes);
});

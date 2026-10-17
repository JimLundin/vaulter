import { openDatabase, createPersistentStorage, type Journal } from '@/vault/eav/index.ts';
import { applicationSchema } from '@/application/composition.ts';
import { wikiActions } from '@/workflows/wiki/data/operations.ts';
import { topicActions } from '@/workflows/graph/data/topics.ts';
import { expect, test } from '@playwright/test';
import { navigateToModule } from '@/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/vault/storage/github-client/fake-github.ts';
import { seal } from '@/vault/session/sealed.ts';

test('production Graph reads persisted topics, navigates subjects and survives reload', async ({
  page,
}) => {
  let journal: Journal = { schemas: [], commits: [] };
  const scope = JSON.stringify([
    'https://api.github.com',
    'JimLundin',
    'vault',
    'main',
    '.vaulter/eav/transactions/',
  ]);
  await using db = await openDatabase({
    schema: applicationSchema,
    storage: createPersistentStorage({
      scope,
      load: async () => journal,
      append: async (publication) => {
        journal = structuredClone({
          schemas: publication.schemas,
          commits: [...journal.commits, publication.commit],
        });
      },
    }),
  });
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Editor', kind: 'user' }),
  );
  const wiki = wikiActions(db, author);
  const morning = await wiki.createPage({ key: 'mornings', title: 'Slow mornings', summary: '' });
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await topicActions(db, { author }).promote({
    key: 'mornings',
    subject: await db.history.reference(snapshot, morning),
    title: 'Slow mornings',
    rationale: 'A recurring area of inquiry.',
  });
  const files = Object.fromEntries(
    journal.commits.map((commit, index) => [
      `.vaulter/eav/transactions/${commit.id}.json`,
      JSON.stringify({
        base: journal.commits[index - 1]?.id ?? null,
        format: 1,
        scope,
        schemas: journal.schemas.slice(0, commit.schemaRevision),
        commit,
      }),
    ]),
  );
  const fake = await fakeGitHub(files);
  const password = 'fictional-production-password';
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
  await navigateToModule(page, 'Graph');
  const diagram = page.getByRole('figure', { name: 'Global Vault graph' });
  await expect(diagram).toBeVisible();
  await diagram.getByRole('button', { name: 'Explore Slow mornings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
  await page.reload();
  if (await page.getByLabel('Password', { exact: true }).isVisible()) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open source', exact: true })).toHaveAttribute(
    'href',
    '#/wiki/mornings/',
  );
  await page.evaluate(() => {
    location.hash = '#/wiki/mornings/';
  });
  await expect(page.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
});

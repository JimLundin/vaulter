import { expect, test } from '@playwright/test';
import { createPersistentStorage, openDatabase, type Journal } from '@/core/store/index.ts';
import { applicationSchema } from '@/application/composition/database.ts';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { seal } from '@/core/session/sealed.ts';

test('production Wiki and Chat insert record embeds without Agent execution and preserve live and pinned states', async ({
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
    load: async () => journal,
    append: async (request) => {
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
      files[`.vaulter/eav/transactions/${encodeURIComponent(request.commit.id)}.json`] =
        JSON.stringify(request);
    },
  });
  await using db = await openDatabase({ schema: applicationSchema, storage });
  await db.transaction(async (tx) => {
    await tx.entities.wikiPages.insert({
      key: 'embeds',
      title: 'Embedded tasks',
      summary: '',
      aliases: [],
      available: true,
      createdAt: new Date(),
    });
    const owner = await tx.entities.actors.insert({ name: 'Owner', kind: 'user' });
    const conversation = await tx.entities.conversations.insert({ createdAt: new Date() });
    const exchange = await tx.entities.exchanges.insert({ conversation, position: 0 });
    await tx.entities.messages.insert({
      exchange,
      author: owner,
      at: new Date(),
      text: 'Existing discussion',
    });
    await tx.entities.tasks.insert({
      title: 'Original task',
      description: '',
      status: 'backlog',
      available: true,
    });
  });
  const fake = await fakeGitHub(files);
  const password = 'fictional-embed-password';
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
  await page.goto('/#/wiki/embeds/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  const host = page.getByRole('region', { name: 'Wiki reading' });
  await host.getByRole('button', { name: 'Embed a record', exact: true }).click();
  await host.getByLabel('Record to embed').selectOption({ label: 'Task · Original task' });
  await host.getByRole('button', { name: 'Embed record', exact: true }).click();
  await expect(host.getByRole('heading', { name: 'Original task', exact: true })).toHaveCount(1);
  await host.getByLabel('Embed state').selectOption('pinned');
  await host.getByRole('button', { name: 'Embed record', exact: true }).click();
  await expect(host.getByRole('heading', { name: 'Original task', exact: true })).toHaveCount(2);
  await page.goto('/#/chat/');
  await page.getByRole('button', { name: 'Embed a record', exact: true }).last().click();
  const chatControls = page.getByRole('region', { name: 'Embedded records' }).last();
  await chatControls.getByLabel('Record to embed').selectOption({ label: 'Task · Original task' });
  await chatControls.getByRole('button', { name: 'Embed record', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Original task', exact: true })).toHaveCount(1);
  await chatControls
    .getByRole('button', { name: 'Remove embed: Task · Original task', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Original task', exact: true })).toHaveCount(0);
  await page.goto('/#/tasks/');
  await page.getByRole('button', { name: 'Edit Original task', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Changed task');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/wiki/embeds/');
  await expect(host.getByRole('heading', { name: 'Changed task', exact: true })).toHaveCount(1);
  await expect(host.getByRole('heading', { name: 'Original task', exact: true })).toHaveCount(1);
  await page.reload();
  await expect(host.getByRole('heading', { name: 'Changed task', exact: true })).toHaveCount(1);
  await expect(host.getByRole('heading', { name: 'Original task', exact: true })).toHaveCount(1);
  await host.getByRole('button', { name: 'Embed a record', exact: true }).click();
  await host.getByRole('button', { name: 'Remove embed: Task · Changed task' }).first().click();
  await expect(host.getByRole('heading', { name: 'Changed task', exact: true })).toHaveCount(0);
});

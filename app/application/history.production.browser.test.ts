import { openAppAction } from '@/shared/ui/kit/navigation.browser.test-support.ts';
import { createPersistentStorage, openDatabase, type Journal } from '@/core/store/index.ts';
import { chatSchema } from '@/modules/conversation/records.ts';
import { expect, test } from '@playwright/test';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { seal } from '@/core/session/sealed.ts';

test('production History displays historical attribution and survives reload', async ({ page }) => {
  const eavFiles: Record<string, string> = {};
  let journal: Journal = { schemas: [], commits: [] };
  const scope = JSON.stringify([
    'https://api.github.com',
    'JimLundin',
    'vault',
    'main',
    '.vaulter/eav/transactions/',
  ]);
  const eav = createPersistentStorage({
    scope,
    load: async () => journal,
    append: async ({ schemas, commit, base }) => {
      journal = { schemas, commits: [...journal.commits, commit] };
      eavFiles[`.vaulter/eav/transactions/${encodeURIComponent(commit.id)}.json`] = JSON.stringify({
        base,
        format: 1,
        scope,
        schemas,
        commit,
      });
    },
  });
  await using database = await openDatabase({ schema: chatSchema, storage: eav });
  const author = await database.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Original speaker', kind: 'user' }),
  );
  const message = await database.transaction({ author }, async (tx) => {
    const conversation = await tx.entities.conversations.insert({ createdAt: new Date() });
    const exchange = await tx.entities.exchanges.insert({
      conversation,
      position: 1,
      startedAt: new Date(),
    });
    return tx.entities.messages.insert({
      exchange,
      author,
      at: new Date(),
      text: 'Original history message',
    });
  });
  await database.transaction({ author }, (tx) =>
    tx.entities.messages.update({ ...message, text: 'Updated history message' }),
  );
  await database.transaction((tx) =>
    tx.entities.actors.update({ ...author, name: 'Current speaker' }),
  );
  const fake = await fakeGitHub(eavFiles);
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
  await page.goto('/#/chat/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const compact = test.info().project.name === 'phone';
  if (compact) await page.getByRole('button', { name: 'Modules', exact: true }).click();
  const core = compact
    ? page.locator('.kit-edge-menu-brand').first()
    : page.locator('[data-slot="sidebar-header"]');
  const signOut = core.getByRole(compact ? 'menuitem' : 'button', {
    name: 'Sign out',
    exact: true,
  });
  await expect(signOut).toBeVisible();
  const signOutBox = (await signOut.boundingBox())!;
  const settingsBox = (await core
    .getByRole(compact ? 'menuitem' : 'button', {
      name: 'Settings',
      exact: true,
    })
    .boundingBox())!;
  expect(signOutBox.y + signOutBox.height / 2).toBeCloseTo(
    settingsBox.y + settingsBox.height / 2,
    0,
  );
  expect(signOutBox.x).toBeGreaterThan(settingsBox.x);
  if (compact) await page.keyboard.press('Escape');
  await input.fill('A draft stays here');
  const original = page.url();
  await openAppAction(page, 'History');
  await expect(page.getByRole('dialog', { name: 'History', exact: true })).toBeVisible();
  expect(page.url()).toBe(original);
  const eavTitle = 'Updated chat message: Updated history message';
  const eavRow = page.getByRole('region', { name: eavTitle, exact: true });
  await expect(eavRow).toContainText('Original speaker');
  await expect(eavRow).not.toContainText('Current speaker');
  await eavRow.getByRole('button', { name: eavTitle, exact: true }).click();
  await expect(
    eavRow.getByRole('cell', { name: 'Original history message', exact: true }),
  ).toBeVisible();
  await expect(
    eavRow.getByRole('cell', { name: 'Updated history message', exact: true }),
  ).toBeVisible();
  await expect(eavRow.getByRole('button', { name: /Undo transaction/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close history', exact: true }).click();
  await expect(input).toHaveValue('A draft stays here');
  expect(page.url()).toBe(original);
  await page.reload();
  await openAppAction(page, 'History');
  await expect(page.getByRole('region', { name: eavTitle, exact: true })).toContainText(
    'Original speaker',
  );
  await page.getByRole('button', { name: 'Close history', exact: true }).click();
  if (compact) await page.getByRole('button', { name: 'Modules', exact: true }).click();
  await signOut.click();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
});

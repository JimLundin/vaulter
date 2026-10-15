import { expect, test } from '@playwright/test';
import { navigateToModule } from '../ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '../vault/storage/github-client/fake-github.ts';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request } from '../vault/nodes/fixtures.test-support.ts';
import { seal } from '../vault/session/sealed.ts';
import { accept } from '../vault/nodes/history.ts';
import { canonical, digest } from '../vault/nodes/json.ts';

test('production opens real Wiki pages and exact evidence alongside persistent Chat', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
    Object.defineProperty(globalThis, 'cspViolations', { value: violations });
  });
  const nodes = memoryNodeBackend();
  const sourceText =
    'Earlier plans. '.repeat(40) +
    'I want quiet mornings in the studio.' +
    ' Later details.'.repeat(40);
  const passageStart = sourceText.indexOf('I want');
  const input = request('wiki-fixture', [
    create('user', { kind: 'actor', name: 'Fictional owner' }),
    create('studio', { kind: 'page', title: 'Garden studio', summary: 'Space for making things.' }),
    create('paragraph', { kind: 'paragraph' }, 'studio'),
    {
      ...create('sentence', { kind: 'run', text: 'Keep the ' }, 'paragraph'),
      placement: { parent: 'paragraph', order: 'a' },
    },
    {
      ...create('sentence-bold', { kind: 'run', text: 'mornings', marks: ['strong'] }, 'paragraph'),
      placement: { parent: 'paragraph', order: 'b' },
    },
    {
      ...create(
        'sentence-end',
        { kind: 'run', text: ' free. Afternoons are flexible.' },
        'paragraph',
      ),
      placement: { parent: 'paragraph', order: 'c' },
    },
    create('tag', { kind: 'term', scheme: 'tag', key: 'creative', label: 'Creative work' }),
    {
      ...create('tag-link', { kind: 'relationship', predicate: 'tag' }, 'studio'),
      connection: { source: { node: 'studio' }, target: { node: 'tag' } },
    },
    create('source-paragraph', { kind: 'paragraph' }, 'studio'),
    create('chat', {
      kind: 'conversation',
      title: 'Studio plans',
      createdAt: '2026-10-11T09:00:00Z',
    }),
    create('exchange', { kind: 'exchange', startedAt: '2026-10-11T09:00:00Z' }, 'chat'),
    create(
      'source',
      {
        kind: 'message',
        role: 'user',
        at: '2026-10-11T09:00:00Z',
        text: sourceText,
      },
      'exchange',
    ),
    {
      ...create(
        'citation',
        {
          kind: 'cite',
          unit: 'utf16',
          claim: { sequence: 1, start: 0, end: 23 },
          passage: {
            sequence: 1,
            start: passageStart,
            end: passageStart + 'I want quiet mornings in the studio.'.length,
          },
        },
        'paragraph',
      ),
      connection: {
        source: { node: 'paragraph', transaction: 'wiki-fixture' },
        target: { node: 'source', transaction: 'wiki-fixture' },
      },
    },
    {
      ...create('page-source', { kind: 'cite', scope: 'page', sequence: 1 }, 'studio'),
      connection: {
        source: { node: 'studio', transaction: 'wiki-fixture' },
        target: { node: 'source', transaction: 'wiki-fixture' },
      },
    },
    {
      ...create('source-link', { kind: 'link', text: 'Planning conversation' }, 'source-paragraph'),
      connection: { source: { node: 'source-paragraph' }, target: { node: 'exchange' } },
    },
  ]);
  const transaction = await nodes.commit(input);
  const record = accept([], input, await digest(canonical(input)), transaction.recordedAt);
  const fake = await fakeGitHub({
    '.vaulter/nodes/v1/transactions/wiki-fixture.json': JSON.stringify(record),
  });
  const password = 'fictional-production-password';
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
  await page.goto('/');
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-eval');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await navigateToModule(page, 'Wiki');
  await expect(page).toHaveURL(/#\/wiki\/$/);
  await page.getByRole('link', { name: 'Garden studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  const claim = page.getByRole('button', {
    name: 'Evidence for Keep the mornings free.',
    exact: true,
  });
  await expect(claim).toHaveCount(1);
  await expect(claim.locator('strong')).toHaveText('mornings');
  await expect(page.getByRole('button', { name: /Afternoons/ })).toHaveCount(0);
  await page.getByRole('button', { name: /evidence for keep the mornings free/i }).click();
  const evidence = page.getByRole(
    test.info().project.name === 'phone' ? 'dialog' : 'complementary',
    { name: 'References' },
  );
  await expect(evidence).toBeVisible();
  await expect(evidence.locator('mark')).toHaveText('I want quiet mornings in the studio.');
  const contextToggle = evidence.getByRole('button', { name: 'Context from Studio plans' });
  await contextToggle.click();
  await expect(contextToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(evidence.getByLabel('Source context')).toContainText(
    'Earlier plans. Earlier plans.',
  );
  await contextToggle.focus();
  await contextToggle.press('Enter');
  await expect(contextToggle).toHaveAttribute('aria-expanded', 'false');
  if (test.info().project.name === 'desktop') {
    const bounds = await page.evaluate(() => {
      const toolbar = document
        .querySelector('[role="toolbar"][aria-label="Wiki page"]')!
        .getBoundingClientRect();
      const references = document
        .querySelector('[aria-label="References"] [data-slot="drawer-header"]')!
        .getBoundingClientRect();
      return {
        toolbar: { top: toolbar.top, height: toolbar.height },
        references: { top: references.top, height: references.height },
      };
    });
    expect(bounds.toolbar.height).toBe(48);
    expect(bounds.references.height).toBe(48);
    expect(bounds.references.top).toBe(bounds.toolbar.top);
  }
  await expect(
    evidence.getByText('I want quiet mornings in the studio.', { exact: false }),
  ).toBeVisible();
  await expect(evidence.getByRole('link', { name: 'Studio plans' })).toHaveAttribute(
    'href',
    '#/chat/chat/',
  );
  if (test.info().project.name === 'phone') {
    await evidence.getByRole('button', { name: 'Close references' }).click();
    await expect(page.getByRole('button', { name: /evidence for keep/i })).toBeFocused();
  }
  await page
    .getByRole('heading', { name: 'Garden studio', exact: true })
    .getByRole('button')
    .click();
  await expect(evidence.getByRole('link', { name: 'Studio plans' })).toHaveCount(2);
  await expect(evidence.locator('mark')).toHaveCount(0);
  if (test.info().project.name === 'phone')
    await evidence.getByRole('button', { name: 'Close references' }).click();
  await page.getByRole('button', { name: 'Tag: Creative work', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pages tagged Creative work' })).toBeVisible();
  await page.getByRole('link', { name: 'Garden studio', exact: true }).click();
  await page.getByRole('button', { name: 'Wiki', exact: true }).click();
  await expect(page).toHaveURL(/#\/wiki\/$/);
  await page.getByRole('link', { name: 'Garden studio', exact: true }).click();
  await page.getByRole('button', { name: /evidence for keep/i }).click();
  await evidence.getByRole('link', { name: 'Studio plans' }).click();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
  expect(await page.evaluate(() => Reflect.get(globalThis, 'cspViolations'))).toEqual([]);
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
  await navigateToModule(page, 'Chat');
  const conversations = page.getByRole('button', { name: 'Conversations', exact: true });
  if (test.info().project.name === 'phone') {
    await expect(conversations).toBeVisible();
    await expect(conversations).toHaveText('');
    await conversations.click();
  } else await expect(conversations).toBeHidden();
  await page.getByRole('button', { name: /studio plans/i }).click();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
  const cached = await page.evaluate(async () => {
    const names = (await indexedDB.databases())
      .map((database) => database.name)
      .filter((name): name is string => !!name);
    const databases = await Promise.all(
      names.map(async (name) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const opening = indexedDB.open(name);
          opening.onsuccess = () => resolve(opening.result);
          opening.onerror = () => reject(opening.error);
        });
        const stores = [...database.objectStoreNames];
        const rows = await Promise.all(
          stores.map(
            (store) =>
              new Promise<unknown[]>((resolve, reject) => {
                const read = database.transaction(store).objectStore(store).getAll();
                read.onsuccess = () => resolve(read.result);
                read.onerror = () => reject(read.error);
              }),
          ),
        );
        database.close();
        return { name, stores, rows: rows.flat() };
      }),
    );
    const vaultData = databases.filter((database) => database.name !== 'vault');
    return {
      vaultText: JSON.stringify(vaultData),
      credentialFields: databases
        .find((database) => database.name === 'vault')
        ?.rows.map((row) => Object.keys(row as object)),
    };
  });
  expect(cached.vaultText).toContain('I want quiet mornings in the studio.');
  expect(cached.vaultText).not.toContain('fictional-token');
  expect(cached.credentialFields).toEqual([['id', 'key', 'salt', 'expires']]);
  expect(await page.evaluate(() => Reflect.get(globalThis, 'cspViolations'))).toEqual([]);
});

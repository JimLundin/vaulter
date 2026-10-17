import { openDatabase, createPersistentStorage, type Journal } from '@/vault/eav/index.ts';
import { applicationSchema } from './composition.ts';
import { wikiActions } from '@/workflows/wiki/data/operations.ts';
import { expect, test } from '@playwright/test';
import { navigateToModule } from '@/ui/kit/navigation.browser.test-support.ts';
import { fakeGitHub } from '@/vault/storage/github-client/fake-github.ts';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request } from '@/vault/nodes/fixtures.test-support.ts';
import { seal } from '@/vault/session/sealed.ts';
import { accept } from '@/vault/nodes/history.ts';
import { canonical, digest } from '@/vault/nodes/json.ts';

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
  ]);
  const transaction = await nodes.commit(input);
  const record = accept([], input, await digest(canonical(input)), transaction.recordedAt);
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
    tx.entities.actors.insert({ name: 'Fictional owner', kind: 'user' }),
  );
  const wiki = wikiActions(db, author);
  const wikiPage = await wiki.createPage({
    key: 'studio',
    title: 'Garden studio',
    summary: 'Space for making things.',
  });
  const paragraph = await wiki.append(
    'paragraph',
    { kind: 'paragraph' },
    { page: wikiPage, order: 'a' },
  );
  await wiki.append(
    'start',
    { kind: 'text', text: 'Keep the ' },
    { parent: paragraph, order: 'a' },
  );
  await wiki.append(
    'bold',
    { kind: 'text', text: 'mornings', marks: ['strong'] },
    { parent: paragraph, order: 'b' },
  );
  await wiki.append(
    'end',
    { kind: 'text', text: ' free. Afternoons are flexible.' },
    { parent: paragraph, order: 'c' },
  );
  const source = await db.transaction((tx) =>
    tx.entities.sourceDocuments.insert({
      key: 'source',
      title: 'Studio plans',
      text: sourceText,
      origin: '#/chat/chat/',
      attribution: 'Fictional owner',
      capturedAt: new Date(),
      available: true,
    }),
  );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const address = await db.history.reference(snapshot, source);
  await wiki.referencePage('source', wikiPage, address);
  await wiki.review({
    key: 'review',
    assertion: {
      target: await db.history.reference(snapshot, paragraph),
      format: 'wiki-text-utf16-v1',
      start: 0,
      end: 23,
    },
    passages: [
      {
        target: address,
        format: 'source-text-utf16-v1',
        start: passageStart,
        end: passageStart + 'I want quiet mornings in the studio.'.length,
      },
    ],
    result: 'supported',
    rationale: 'Retained account supports this clause.',
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
  const fake = await fakeGitHub({
    ...files,
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
  let headerStyle: string | undefined;
  for (const module of ['Chat', 'Wiki', 'Questions', 'Graph'] as const) {
    await navigateToModule(page, module);
    const header = page.locator('[data-page-header]');
    await expect(header.getByRole('heading', { name: module, exact: true })).toBeVisible();
    const geometry = await header.evaluate((element) => {
      const title = element.querySelector('h1')!;
      const style = getComputedStyle(title);
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        height: bounds.height,
        inset: title.getBoundingClientRect().left - bounds.left,
        type: [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight].join('|'),
      };
    });
    expect(geometry.top).toBe(0);
    expect(geometry.height).toBe(48);
    expect(geometry.inset).toBeGreaterThan(0);
    const currentStyle = `${geometry.inset}|${geometry.type}`;
    headerStyle ??= currentStyle;
    expect(currentStyle).toBe(headerStyle);
  }
  await navigateToModule(page, 'Wiki');
  await expect(page).toHaveURL(/#\/wiki\/$/);
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page
    .getByRole('region', { name: 'Page directory' })
    .getByRole('button', { name: 'Garden studio', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  await expect(page.locator('[data-page-header] h1')).toHaveText('Wiki');
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
    .getByRole('heading', { name: 'Garden studio', exact: true, level: 1 })
    .getByRole('button')
    .click();
  await expect(evidence.getByRole('link', { name: 'Studio plans' })).toHaveCount(1);
  await expect(evidence.locator('mark')).toHaveCount(0);
  if (test.info().project.name === 'phone')
    await evidence.getByRole('button', { name: 'Close references' }).click();
  await page.getByRole('button', { name: 'Wiki', exact: true }).click();
  await expect(page).toHaveURL(/#\/wiki\/$/);
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page
    .getByRole('region', { name: 'Page directory' })
    .getByRole('button', { name: 'Garden studio', exact: true })
    .click();
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
  await expect(page.getByRole('button', { name: 'Conversations', exact: true })).toHaveCount(0);
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

import { expect, test } from '@playwright/test';
import { fakeGitHub } from '../../app/vault/storage/github-client/fake-github.ts';
import { memoryNodeBackend } from '../../app/vault/nodes/memory.ts';
import { create, request } from '../../app/vault/nodes/fixtures.test-support.ts';
import { seal } from '../../app/vault/session/sealed.ts';
import { sampleFiles } from '../../app/preview/data.ts';
import { accept } from '../../app/vault/nodes/history.ts';
import { canonical, digest } from '../../app/vault/nodes/json.ts';

test('production opens real Wiki pages and exact evidence alongside persistent Chat', async ({
  page,
}) => {
  const nodes = memoryNodeBackend();
  const input = request('wiki-fixture', [
    create('user', { kind: 'actor', name: 'Fictional owner' }),
    create('studio', { kind: 'page', title: 'Garden studio', summary: 'Space for making things.' }),
    create('paragraph', { kind: 'paragraph' }, 'studio'),
    create('sentence', { kind: 'run', text: 'Keep the mornings free.' }, 'paragraph'),
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
        text: 'I want quiet mornings in the studio.',
      },
      'exchange',
    ),
    {
      ...create('citation', { kind: 'cite' }, 'paragraph'),
      connection: {
        source: { node: 'paragraph' },
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
    ...sampleFiles,
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
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Wiki', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Wiki', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Garden studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  await expect(page.getByText('Keep the mornings free.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /evidence for keep the mornings free/i }).click();
  const evidence = page.getByRole(
    test.info().project.name === 'phone' ? 'dialog' : 'complementary',
    { name: 'Why the page says this' },
  );
  await expect(evidence).toBeVisible();
  await expect(
    evidence.getByText('I want quiet mornings in the studio.', { exact: false }),
  ).toBeVisible();
  await expect(evidence.getByRole('link', { name: 'Open source' })).toHaveAttribute(
    'href',
    '#/chat/chat/',
  );
  await evidence.getByRole('button', { name: /close why/i }).click();
  await expect(page.getByRole('button', { name: /evidence for keep/i })).toBeFocused();
  await page.getByRole('button', { name: 'Source for Planning conversation' }).click();
  await expect(evidence).toContainText('I want quiet mornings in the studio.');
  await evidence.getByRole('button', { name: /close why/i }).click();
  await page.getByRole('button', { name: /evidence for keep/i }).click();
  await evidence.getByRole('link', { name: 'Open source' }).click();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Chat', exact: true }).click();
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await page.getByRole('button', { name: /studio plans/i }).click();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toContainText(
    'I want quiet mornings in the studio.',
  );
});

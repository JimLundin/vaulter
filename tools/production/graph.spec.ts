import { expect, test } from '@playwright/test';
import { navigateToModule } from '../browser/app-navigation.ts';
import { fakeGitHub } from '../../app/vault/storage/github-client/fake-github.ts';
import { memoryNodeBackend } from '../../app/vault/nodes/memory.ts';
import { create, request } from '../../app/vault/nodes/fixtures.test-support.ts';
import { seal } from '../../app/vault/session/sealed.ts';
import { accept } from '../../app/vault/nodes/history.ts';
import { canonical, digest } from '../../app/vault/nodes/json.ts';

test('production Graph reads persisted relationships, navigates subjects and survives reload', async ({
  page,
}) => {
  const nodes = memoryNodeBackend();
  const input = request('graph-fixture', [
    create('user', { kind: 'actor' }),
    create('studio', { kind: 'page', title: 'Garden studio' }),
    create('mornings', { kind: 'page', title: 'Slow mornings' }),
    create('predicate', {
      kind: 'term',
      scheme: 'predicate',
      key: 'related-to',
      label: 'Related to',
      symmetric: true,
    }),
    {
      ...create('edge', { kind: 'relationship', predicate: 'related-to' }, 'studio'),
      connection: { source: { node: 'studio' }, target: { node: 'mornings' } },
    },
  ]);
  const transaction = await nodes.commit(input);
  const record = accept([], input, await digest(canonical(input)), transaction.recordedAt);
  const fake = await fakeGitHub({
    '.vaulter/nodes/v1/transactions/graph-fixture.json': JSON.stringify(record),
  });
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
  const diagram = page.getByRole('figure', { name: 'Connections around Garden studio' });
  await expect(diagram).toBeVisible();
  await diagram.getByRole('button', { name: 'Explore Slow mornings', exact: true }).click();
  await expect(
    page.getByRole('figure', { name: 'Connections around Slow mornings' }),
  ).toBeVisible();
  await page.reload();
  if (await page.getByLabel('Password', { exact: true }).isVisible()) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  }
  await expect(
    page.getByRole('figure', { name: 'Connections around Slow mornings' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open source', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
  nodes.close();
});

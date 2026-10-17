import { openAppAction } from '../../ui/kit/navigation.browser.test-support.ts';
import { expect, test } from '@playwright/test';

test('each preview tab retains its own single dialogue across reload', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Remember this tab');
  await input.press('Enter');
  await expect(page.locator('[data-message="agent"]')).toBeVisible();
  const other = await page.context().newPage();
  await other.goto('/preview/');
  await expect(other.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await expect(other.locator('[data-message]')).toHaveCount(0);
  await expect(other.getByText('Expected finite, acyclic JSON', { exact: false })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toContainText('Remember this tab');
  await expect(page.getByText('Expected finite, acyclic JSON', { exact: false })).toHaveCount(0);
  await other.close();
});

async function movePreviewBelowToolbar(handle: { press: (key: string) => Promise<void> }) {
  // Move the overlay out of the toolbar before using the app beneath it.
  for (let step = 0; step < 10; step++) await handle.press('Shift+ArrowDown');
}

for (const restriction of ['recording', 'save recovery']) {
  test(`Search never creates another dialogue during or after ${restriction}`, async ({ page }) => {
    await page.goto(restriction === 'recording' ? '/preview/' : '/preview/?scenario=initial-save');
    await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
    const main = page.getByRole('main');
    const input = main.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('Keep this conversation');
    await input.press('Enter');
    await expect(main.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
    if (restriction === 'recording') {
      await input.fill('Keep the recording draft');
      await input.blur();
      await main.getByRole('button', { name: 'Start voice interaction' }).click();
      await expect(input).toHaveValue(/^Keep the recording draft Leave/);
    } else {
      await expect(main.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
      await input.fill('Keep the recovery draft');
      await input.blur();
    }
    await openAppAction(page, 'Search');
    const search = page.getByRole('dialog', { name: 'Search or ask' });
    await search.getByRole('combobox').fill('New chat');
    await expect(search.getByRole('option', { name: 'New chat', exact: true })).toHaveCount(0);
    await search.getByRole('combobox').press('Escape');
    if (restriction === 'recording')
      await main.getByRole('button', { name: 'Finish recording', exact: true }).click();
    else await main.getByRole('button', { name: 'Retry save', exact: true }).click();
    await openAppAction(page, 'Search');
    await search.getByRole('combobox').fill('New chat');
    await expect(search.getByRole('option', { name: 'New chat', exact: true })).toHaveCount(0);
    await search.getByRole('combobox').press('Escape');
    await expect(main.locator('[data-message="user"]')).toHaveCount(1);
    await expect(input).not.toHaveValue('');
  });
}

test('Search Ask is accepted once when Chat moves between the page and its supporting pane', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
  await openAppAction(page, 'Search');
  const search = page.getByRole('dialog', { name: 'Search or ask' });
  await search.getByRole('combobox').fill('Review prompt only once');
  await search.getByRole('option', { name: 'Ask the agent: Review prompt only once' }).click();
  await expect(page.getByRole('main').locator('[data-message="user"]')).toHaveCount(1);
  await expect(
    page.getByRole('main').getByRole('button', { name: 'Stop', exact: true }),
  ).toBeHidden();
  const accepted = await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'));
  // Hash navigation changes Application's composition without reloading its retained lifetime.
  await page.evaluate(() => {
    location.hash = '#/wiki/';
  });
  const pane = page.getByRole(test.info().project.name === 'phone' ? 'dialog' : 'complementary', {
    name: 'Chat',
    exact: true,
  });
  await expect(pane).toBeVisible();
  await expect(pane.locator('[data-message="user"]')).toHaveCount(1);
  await expect(pane.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  await page.evaluate(() => {
    location.hash = '#/chat/';
  });
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Chat', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('main').locator('[data-message="user"]')).toHaveCount(1);
  expect(await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'))).toBe(
    accepted,
  );
});

test('Search Ask during recording survives reopening, never auto-sends, and explicit Use submits once', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
  const main = page.getByRole('main');
  const input = main.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep my recorded draft');
  await input.blur();
  await main.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(input).toHaveValue(/^Keep my recorded draft Leave/);
  await openAppAction(page, 'Search');
  const search = page.getByRole('dialog', { name: 'Search or ask' });
  await search.getByRole('combobox').fill('Ask after recording');
  await search.getByRole('option', { name: 'Ask the agent: Ask after recording' }).click();
  const pane = page.getByRole(test.info().project.name === 'phone' ? 'dialog' : 'complementary', {
    name: 'Chat',
    exact: true,
  });
  const paneInput = pane.getByRole('textbox', { name: 'Message', exact: true });
  await expect(pane.getByText('Ask after recording', { exact: true })).toBeVisible();
  await expect(
    pane.getByRole('status').filter({ hasText: 'before using this text' }),
  ).toBeVisible();
  await pane.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(paneInput).toHaveValue(/^Keep my recorded draft Leave/);
  await pane.getByRole('button', { name: 'Finish recording', exact: true }).click();
  await expect(paneInput).toBeEditable();
  const draft = await paneInput.inputValue();
  await page.evaluate(() => {
    location.hash = '#/wiki/';
  });
  await expect(pane).toBeVisible();
  await expect(pane.getByText('Ask after recording', { exact: true })).toBeVisible();
  await pane.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.evaluate(() => {
    location.hash = '#/chat/';
  });
  await expect(main.getByRole('button', { name: 'Use', exact: true })).toBeVisible();
  await expect(main.locator('[data-message="user"]')).toHaveCount(0);
  await main.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(main.locator('[data-message="user"]')).toHaveCount(1);
  await expect(main.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  await expect(input).toHaveValue(draft);
  await expect(main.getByRole('button', { name: 'Use', exact: true })).toHaveCount(0);
});

test('Send retains EAV dialogue and content receipts across reload without replay', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: leave room for walks');
  await input.press('Enter');
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const before = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]').length,
  );
  await page.reload();
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(page.locator('[data-message="user"]')).toHaveCount(1);
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]').length,
    ),
  ).toBe(before);
});

test('Retry save reconciles the initial message without executing content', async ({ page }) => {
  await page.goto('/preview/?scenario=initial-save');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: keep this thought');
  await input.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: /needs? saving/ })).toBeVisible();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Message saved' })).toBeVisible();
  const created = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]').filter(
        (request: {
          kind: { scope: string; action: string };
          changes: { data?: { kind?: string } }[];
        }) =>
          request.kind.scope === 'node' &&
          request.kind.action === 'create' &&
          request.changes.some((change) => change.data?.kind === 'content'),
      ).length,
  );
  expect(created).toBe(0);
});

test('Retry content save reconciles the original publication without repeating a tool', async ({
  page,
}) => {
  await page.goto('/preview/?scenario=content-save');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: keep publication');
  await input.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Content save:' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  await input.fill('Another message');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  const receipts = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('vaulter:preview:eav:dialogue:v1')!).commits.filter(
      (commit: { facts: { attribute: string }[] }) =>
        commit.facts.some((fact) => fact.attribute === 'agent.toolExecution/status'),
    ),
  );
  await page.getByRole('button', { name: 'Retry content save', exact: true }).click();
  await expect(page.getByText('Content save accepted.', { exact: false })).toBeVisible();
  await expect(input).toHaveValue('Another message');
  await input.focus();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  const counts = await page.evaluate(() => {
    const requests = JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]');
    return {
      contents: requests.filter(
        (request: {
          kind: { scope: string; action: string };
          changes: { data?: { kind?: string } }[];
        }) =>
          request.kind.scope === 'node' &&
          request.kind.action === 'create' &&
          request.changes.some((change) => change.data?.kind === 'content'),
      ).length,
      tools: JSON.parse(sessionStorage.getItem('vaulter:preview:eav:dialogue:v1')!).commits.filter(
        (commit: { facts: { attribute: string }[] }) =>
          commit.facts.some((fact) => fact.attribute === 'agent.toolExecution/status'),
      ),
    };
  });
  expect(counts.contents).toBe(1);
  expect(receipts).toHaveLength(2);
  expect(counts.tools).toEqual(receipts);
});

test('different topics remain in one dialogue after navigation and reload', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  for (const text of ['A morning routine', 'A different subject']) {
    await input.fill(text);
    await input.press('Enter');
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  }
  await expect(page.locator('[data-message="user"]')).toContainText([
    'A morning routine',
    'A different subject',
  ]);
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Conversations', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toContainText([
    'A morning routine',
    'A different subject',
  ]);
});

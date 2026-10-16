import { openAppAction } from '../../ui/kit/navigation.browser.test-support.ts';
import { expect, test } from '@playwright/test';

test('opening a second preview tab keeps conversation selection with each tabs records', {
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
  const conversations = other.getByRole('button', { name: 'Conversations', exact: true });
  if (await conversations.isVisible()) await conversations.click();
  await expect(other.getByText('No saved conversations yet.', { exact: true })).toBeVisible();
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
  test(`Search New chat follows shared selection permission during ${restriction}`, async ({
    page,
  }) => {
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
    await search.getByRole('option', { name: 'New chat', exact: true }).click();
    await expect(main.locator('[data-message="user"]')).toHaveCount(0);
    await expect(input).toHaveValue('');
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
    location.hash = '#/history/';
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
    location.hash = '#/history/';
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

test('node-backed Send retains content receipts and accepted conversation across reload without replay', {
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
    JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]').filter(
      (request: { kind: { action: string } }) =>
        ['recordTool', 'completeTool'].includes(request.kind.action),
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
      tools: requests.filter((request: { kind: { action: string } }) =>
        ['recordTool', 'completeTool'].includes(request.kind.action),
      ),
    };
  });
  expect(counts.contents).toBe(1);
  expect(receipts).toHaveLength(2);
  expect(counts.tools).toEqual(receipts);
});

test('conversation picker opens saved node conversations and History lists every accepted transaction', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  if (test.info().project.name === 'phone')
    await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: first conversation');
  await input.press('Enter');
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  const picker = page.getByRole(test.info().project.name === 'phone' ? 'dialog' : 'complementary', {
    name: 'Conversations',
    exact: true,
  });
  await expect(picker.getByRole('button', { name: /first conversation/ })).toBeVisible();
  if (test.info().project.name === 'phone')
    await picker.getByRole('button', { name: 'Close conversations', exact: true }).click();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await input.fill('vault it: second conversation');
  await input.press('Enter');
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await picker.getByRole('button', { name: /first conversation/ }).click();
  await expect(page.locator('[data-message="user"]')).toContainText('first conversation');
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toContainText('first conversation');
  const count = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]').length,
  );
  await page.goto('/preview/#/history/');
  await expect(page.getByText(`#${count}`, { exact: true })).toBeVisible();
  while (await page.getByRole('button', { name: 'Load earlier', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Load earlier', exact: true }).click();
  await expect(page.getByText('#1', { exact: true })).toBeVisible();
});

test('saved conversations use a right sidebar or mobile drawer', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/?conversations');
  if (test.info().project.name === 'phone') {
    await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  }
  const panel = page.getByRole(test.info().project.name === 'phone' ? 'dialog' : 'complementary', {
    name: 'Conversations',
    exact: true,
  });
  await expect(panel.getByRole('button', { name: /Garden studio plans/ })).toBeVisible();
  const bounds = await panel.boundingBox();
  if (test.info().project.name !== 'phone') {
    expect(bounds!.x).toBeGreaterThan(page.viewportSize()!.width / 2);
    await expect(page.getByRole('button', { name: 'Conversations', exact: true })).toBeHidden();
    await expect(
      panel.getByRole('button', { name: 'Close conversations', exact: true }),
    ).toBeHidden();
  } else {
    await panel.getByRole('button', { name: 'Close conversations', exact: true }).click();
    await expect(panel).toBeHidden();
  }
});

test('Chat is named separately from Agent execution and has no History action', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'New chat', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toBeVisible();
  if (test.info().project.name === 'phone') {
    await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Conversations', exact: true })
        .getByRole('button', { name: 'New conversation', exact: true }),
    ).toHaveCount(0);
  }
});

test('timeline conversation rows stay uniform and truncate titles beside right-aligned times', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/?conversations');
  if (test.info().project.name === 'phone') {
    await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  }
  const list = page.getByRole(test.info().project.name === 'phone' ? 'dialog' : 'complementary', {
    name: 'Conversations',
    exact: true,
  });
  const short = list.getByRole('button', { name: /Garden studio plans/ });
  const long = list.getByRole('button', { name: /A longer conversation title/ });
  const first = await short.boundingBox();
  const last = await long.boundingBox();
  expect(first!.height).toBeCloseTo(last!.height, 2);
  const title = long.locator('[title]');
  expect(await title.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(title).toHaveCSS('text-overflow', 'ellipsis');
  const rowText = await long.textContent();
  expect(rowText).toMatch(/\d{2}:30/);
  expect(rowText).not.toContain('Oct');
});

test('recording blocks direct conversation routes and failed reads reconcile navigation without losing the draft', async ({
  page,
}) => {
  await page.goto('/preview/?conversations=numbered');
  await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
  const picker = page.getByRole(test.info().project.name === 'phone' ? 'dialog' : 'complementary', {
    name: 'Conversations',
    exact: true,
  });
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await picker.getByRole('button', { name: /Garden studio plans/ }).click();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Retained typed prefix');
  await input.blur();
  await page.getByRole('button', { name: 'Start voice interaction', exact: true }).click();
  await expect(input).toHaveValue(/^Retained typed prefix/);
  await page.evaluate(() => {
    location.hash = '#/chat/missing-record/';
  });
  await expect(page).toHaveURL(/#\/chat\/$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'before switching conversations' }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish recording', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Finish recording', exact: true }).click();
  const retained = await input.inputValue();
  await page.evaluate(() => {
    location.hash = '#/chat/missing-record/';
  });
  await expect(page).toHaveURL(/#\/chat\/$/);
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(input).toHaveValue(retained);
  if (test.info().project.name === 'phone')
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await expect(picker.getByRole('button', { name: /Garden studio plans/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

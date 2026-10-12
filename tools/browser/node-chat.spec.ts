import { expect, test } from '@playwright/test';

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
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const search = page.getByRole('dialog', { name: 'Search or ask' });
    await search.getByRole('combobox').fill('New chat');
    await expect(search.getByRole('option', { name: 'New chat', exact: true })).toHaveCount(0);
    await search.getByRole('combobox').press('Escape');
    if (restriction === 'recording')
      await main.getByRole('button', { name: 'Finish recording', exact: true }).click();
    else await main.getByRole('button', { name: 'Retry save', exact: true }).click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
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
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Search or ask' });
  await search.getByRole('combobox').fill('Review prompt only once');
  await search.getByRole('option', { name: 'Ask the agent: Review prompt only once' }).click();
  await expect(page.getByRole('main').locator('[data-message="user"]')).toHaveCount(1);
  await expect(
    page.getByRole('main').getByRole('button', { name: 'Stop', exact: true }),
  ).toBeHidden();
  const accepted = await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'));
  // Hash navigation changes Product's composition without reloading its retained lifetime.
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

test('Search Ask during recording survives reopening, never auto-sends, and explicit Use submits once', async ({
  page,
}) => {
  await page.goto('/preview/');
  await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
  const main = page.getByRole('main');
  const input = main.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep my recorded draft');
  await input.blur();
  await main.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(input).toHaveValue(/^Keep my recorded draft Leave/);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
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

test('Search Ask uses retained staged-change review without replacing the existing draft', async ({
  page,
}) => {
  await page.goto('/preview/?legacy-staging');
  await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
  const main = page.getByRole('main');
  const input = main.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep my editable draft');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Search or ask' });
  await search.getByRole('combobox').fill('Review this Search Ask');
  await search.getByRole('option', { name: 'Ask the agent: Review this Search Ask' }).click();
  const review = page.getByRole('dialog', { name: 'Review pending changes', exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByText('Review this Search Ask', { exact: true })).toBeVisible();
  await expect(input).toHaveValue('Keep my editable draft');
  await expect(main.locator('[data-message="user"]')).toHaveCount(0);
  await review.getByRole('button', { name: 'Send and keep staged edits' }).click();
  await expect(main.locator('[data-message="user"]')).toHaveCount(1);
  await expect(input).toHaveValue('Keep my editable draft');
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

for (const scenario of ['initial-save', 'lost-response', 'outcome-save', 'terminal-save']) {
  test(`${scenario} exposes persistence recovery without repeating content`, async ({ page }) => {
    await page.goto(`/preview/?scenario=${scenario}`);
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('vault it: keep this thought');
    await input.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: /needs? saving/ })).toBeVisible();
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    if (scenario === 'initial-save' || scenario === 'lost-response')
      await expect(page.getByRole('status').filter({ hasText: 'Message saved' })).toBeVisible();
    else await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
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
    expect(created).toBe(scenario === 'initial-save' || scenario === 'lost-response' ? 0 : 1);
  });
}

test('Stop retains accepted tool content and reload never replays the unfinished run', async ({
  page,
}) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: slow response');
  await input.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]').some(
          (request: { changes: { data?: { kind?: string } }[] }) =>
            request.changes.some((change) => change.data?.kind === 'content'),
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const journal = await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'));
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toHaveCount(1);
  expect(await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'))).toBe(
    journal,
  );
});

test('a new explicit Send executes after initial save reconciliation without replaying the recorded run', async ({
  page,
}) => {
  await page.goto('/preview/?scenario=initial-save');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('An uncertain initial message');
  await input.press('Enter');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Message saved' })).toBeVisible();
  await input.fill('vault it: an explicit new thought');
  await input.press('Enter');
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(page.locator('[data-message="user"]')).toHaveCount(2);
});

test('Stop during an outcome-save pause retains accepted content and the pending save remains recoverable', async ({
  page,
}) => {
  await page.goto('/preview/?scenario=outcome-save');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: keep completed work');
  await input.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Completed tool outcome needs saving' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const publications = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]').filter(
        (request: { changes: { data?: { kind?: string } }[] }) =>
          request.changes.some((change) => change.data?.kind === 'content'),
      ).length,
  );
  expect(publications).toBe(1);
  await page.reload();
  await expect(page.locator('[data-message="user"]')).toHaveCount(1);
});

test('reload after Chat response save failure shows accepted Agent output and does not execute another run', async ({
  page,
}) => {
  await page.goto('/preview/?scenario=terminal-save');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: preserved response');
  await input.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Chat response needs saving' }),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = 'vaulter:preview:accepted:v1';
    const journal = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    const submission = journal.find(
      (request: { kind: { action: string } }) => request.kind.action === 'submit',
    );
    const response = submission.changes.find(
      (change: { data?: { kind?: string; role?: string } }) =>
        change.data?.kind === 'message' && change.data.role === 'agent',
    );
    journal.push({
      id: 'preview-checkpoint',
      recordedBy: 'vaulter:agent',
      origin: submission.origin,
      kind: { scope: 'chat', action: 'checkpointResponse' },
      message: null,
      undoOf: null,
      changes: [
        {
          ...response,
          expected: submission.id,
          data: {
            ...response.data,
            parts: [{ kind: 'text', text: 'Partial checkpoint to replace.' }],
          },
        },
      ],
    });
    sessionStorage.setItem(key, JSON.stringify(journal));
  });
  const journal = await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'));
  await page.reload();
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(page.getByText('Partial checkpoint to replace.', { exact: true })).toBeHidden();
  await expect(page.getByText('Chat response is unfinished.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'))).toBe(
    journal,
  );
  await input.fill('What was accepted?');
  await input.press('Enter');
  await expect(page.locator('[data-message="user"]')).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const accepted = JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]');
        const submissions = accepted.filter(
          (request: { kind: { action: string } }) => request.kind.action === 'submit',
        );
        return submissions
          .at(-1)
          ?.changes.some(
            (change: { data?: { kind?: string; content?: unknown } }) =>
              change.data?.kind === 'contextInput' &&
              JSON.stringify(change.data.content).includes('transaction'),
          );
      }),
    )
    .toBe(true);
});

for (const scenario of ['content-save', 'content-lost-response']) {
  test(`${scenario} keeps a visible diagnostic and reconciles the original publication without repeating a tool`, async ({
    page,
  }) => {
    await page.goto(`/preview/?scenario=${scenario}`);
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
}

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

for (const variant of ['numbered', 'badged', 'rule']) {
  test(`conversation ${variant} variant uses a right sidebar or mobile drawer`, {
    tag: '@phone',
  }, async ({ page }) => {
    await page.goto(`/preview/?conversations=${variant}`);
    if (test.info().project.name === 'phone') {
      await movePreviewBelowToolbar(page.locator('[data-preview-drag-handle]'));
      await page.getByRole('button', { name: 'Conversations', exact: true }).click();
    }
    const panel = page.getByRole(
      test.info().project.name === 'phone' ? 'dialog' : 'complementary',
      { name: 'Conversations', exact: true },
    );
    await expect(panel.getByRole('button', { name: /Garden studio plans/ })).toBeVisible();
    const bounds = await panel.boundingBox();
    if (test.info().project.name !== 'phone') {
      expect(bounds!.x).toBeGreaterThan(page.viewportSize()!.width / 2);
      await expect(page.getByRole('button', { name: 'Conversations', exact: true })).toBeVisible();
      await expect(
        panel.getByRole('button', { name: 'Close conversations', exact: true }),
      ).toBeHidden();
    } else {
      await panel.getByRole('button', { name: 'Close conversations', exact: true }).click();
      await expect(panel).toBeHidden();
    }
  });
}

test('the preview pill shows the current design and keeps the Chat draft', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/?conversations=numbered');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep this draft while comparing');
  const bar = page.getByRole('complementary', { name: 'Design preview', exact: true });
  if (test.info().project.name === 'phone') {
    await bar.getByRole('button', { name: 'Preview controls', exact: true }).click();
  }
  await expect(bar.getByRole('button', { name: 'Design variation', exact: true })).toContainText(
    'Current design',
  );
  await expect(bar.getByRole('button', { name: 'Previous design', exact: true })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Next design', exact: true })).toBeDisabled();
  await expect(bar.getByRole('combobox', { name: 'Conversation variant' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Next variant' })).toHaveCount(0);
  await expect(input).toHaveValue('Keep this draft while comparing');
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
  await page.goto('/preview/?conversations=rule');
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

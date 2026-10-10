import { expect, test } from '@playwright/test';

test('node-backed Send retains content receipts and accepted conversation across reload without replay', async ({
  page,
}) => {
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

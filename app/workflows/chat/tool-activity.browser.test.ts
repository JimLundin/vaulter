import { expect, test } from '@playwright/test';

test('consecutive tool calls collapse into a summary while their accepted results remain reachable', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/preview/');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('vault it: leave space for a walk before work');
  await field.press('Enter');
  await page.clock.runFor(10_000);
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const group = page.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: /Used createWikiPage.*used updateWikiPage/ }),
  });
  await expect(group).toHaveCount(1);
  await expect(group.locator(':scope > summary')).toContainText('3 steps');
  await expect(group).not.toHaveAttribute('open');
  await expect(group.getByText('createWikiPage (1)', { exact: true })).toBeHidden();
  await group.locator(':scope > summary').click();
  await expect(group.getByText('createWikiPage (1)', { exact: true })).toBeVisible();
  await expect(group.getByText('readWikiPage (1)', { exact: true })).toBeVisible();
  await expect(group.getByText('updateWikiPage (1)', { exact: true })).toBeVisible();
  const create = group.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: 'createWikiPage (1)' }),
  });
  await create.locator(':scope > summary').click();
  await expect(create).toContainText('preview:thought:');
  await expect(create).toContainText('vaulter-eav-snapshot-v1');
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(group.getByText('Accepted', { exact: true })).toHaveCount(3);
  await page.reload();
  await expect(group).toHaveCount(1);
  await group.locator(':scope > summary').click();
  await expect(group.getByText('Accepted', { exact: true })).toHaveCount(3);
});

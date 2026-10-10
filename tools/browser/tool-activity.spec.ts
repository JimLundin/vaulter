import { expect, test } from '@playwright/test';

test('consecutive tool calls collapse into a summary while their accepted results remain reachable', async ({
  page,
}) => {
  await page.goto('/preview/');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('vault it: leave space for a walk before work');
  await field.press('Enter');
  const live = page.getByRole('status').filter({ hasText: 'Thinking…' });
  await expect(live).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const group = page.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: /Created 1 node.*updated 1 node/ }),
  });
  await expect(group).toHaveCount(1);
  await expect(group.locator(':scope > summary')).toContainText('3 steps');
  await expect(group).not.toHaveAttribute('open');
  await expect(group.getByText(/^createNode ·/)).toBeHidden();
  await group.locator(':scope > summary').click();
  await expect(group.getByText(/^createNode ·/)).toBeVisible();
  await expect(group.getByText(/^readNode ·/)).toBeVisible();
  await expect(group.getByText(/^updateNode ·/)).toBeVisible();
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  await expect(group.getByText('Accepted', { exact: true })).toHaveCount(3);
});

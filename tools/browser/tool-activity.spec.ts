import { expect, test } from '@playwright/test';

test('consecutive tool calls collapse into a summary while their results and history remain reachable', async ({
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
    has: page.locator(':scope > summary', { hasText: /Staged 1 file.*committed/ }),
  });
  await expect(group).toHaveCount(1);
  await expect(group.locator(':scope > summary')).toContainText('3 steps');
  await expect(group).not.toHaveAttribute('open');
  await expect(group.getByText('writeFile · Preview thought.md', { exact: true })).toBeHidden();
  await group.locator(':scope > summary').click();
  await expect(group.getByText('writeFile · Preview thought.md', { exact: true })).toBeVisible();
  await expect(group.getByText('check', { exact: true })).toBeVisible();
  await expect(group.getByText('commit · Capture a sample thought', { exact: true })).toBeVisible();
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  const committed = page.locator('[data-message="agent"]').getByRole('link', { name: /committed/ });
  await committed.click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText('Capture a sample thought', { exact: true })).toBeVisible();
});

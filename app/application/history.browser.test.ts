import { openAppAction, expectAppActionFocus } from '../ui/kit/navigation.browser.test-support.ts';
import { expect, test } from '@playwright/test';

test('shared expandable rows retain independent disclosure and action behavior in bounded samples', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Expandable rows');
  const family = page.locator('[data-kit-comparison="expandable-rows"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  const desktopToggle = desktop.getByRole('button', {
    name: 'Leave space for slow mornings',
    exact: true,
  });
  const mobileToggle = mobile.getByRole('button', {
    name: 'Leave space for slow mornings',
    exact: true,
  });
  await desktopToggle.focus();
  await desktopToggle.press('Enter');
  await expect(desktopToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(
    desktop.getByText('Keep the morning free for focused work.', { exact: true }),
  ).toBeVisible();
  await expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
  expect((await mobileToggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await mobileToggle.click();
  await mobile.getByRole('button', { name: 'Restore slow mornings', exact: true }).click();
  await expect(mobile.getByRole('status')).toHaveText('Restore requested');
  await expect(desktop.getByRole('status')).toHaveCount(0);
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(desktopToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');
  await mobileToggle.focus();
  await mobileToggle.press('Space');
  await expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
});

test('History expands a transaction and confirms guarded compensation without rewriting the conversation', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('vault it: keep mornings quiet');
  await input.press('Enter');
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
  // The visible reply streams before terminal acceptance; navigation must retain the completed reply.
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const conversationURL = page.url();
  await input.fill('Keep this draft while reviewing changes');
  await openAppAction(page, 'History');
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  await expect(history).toBeVisible();
  expect(page.url()).toBe(conversationURL);
  await expect(
    page.getByRole('link', { name: 'History', exact: true, includeHidden: true }),
  ).toHaveCount(0);
  const update = page.getByRole('button', { name: 'Update Preview thought', exact: true });
  await update.click();
  await expect(update).toHaveAttribute('aria-expanded', 'true');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(history).toBeVisible();
    await expect(update).toHaveAttribute('aria-expanded', 'true');
    await expect(history).toHaveCSS('border-top-left-radius', width < 768 ? '10px' : '12px');
  }
  await expect(page.getByText('Updated content: Preview thought', { exact: true })).toBeVisible();
  // Select the action through the public record region instead of its layout DOM.
  const action = page
    .getByRole('region', { name: 'Update Preview thought', exact: true })
    .getByRole('button', { name: /Undo transaction #/ });
  await action.click();
  const review = page.getByRole('dialog', { name: 'Undo “Update Preview thought”?', exact: true });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(review).toBeHidden();
  await expect(action).toBeFocused();
  await action.click();
  await review.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(review).toBeHidden();
  await expect(page.getByRole('button', { name: /^Undo [a-z0-9-]+$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close history', exact: true }).click();
  await expect(history).toBeHidden();
  expect(page.url()).toBe(conversationURL);
  await expect(input).toHaveValue('Keep this draft while reviewing changes');
  await expect(page.locator('[data-message="user"]')).toContainText(
    'vault it: keep mornings quiet',
  );
  await expect(page.getByText('Filed in', { exact: false })).toBeVisible();
});

test('History opens from core actions, search, shortcut and its retained direct URL', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  const original = page.url();
  await openAppAction(page, 'History');
  await expect(history).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close history', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await expectAppActionFocus(page, 'History');
  expect(page.url()).toBe(original);
  await openAppAction(page, 'Search');
  await page
    .getByRole('dialog', { name: 'Search or ask', exact: true })
    .getByRole('combobox')
    .fill('History');
  await page.getByRole('option', { name: /^History(?:\s|$)/ }).click();
  await expect(history).toBeVisible();
  expect(page.url()).toBe(original);
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await page.keyboard.press('g');
  await page.keyboard.press('y');
  await expect(history).toBeVisible();
  expect(page.url()).toBe(original);
  await page.goto('/preview/#/history/');
  await expect(history).toBeVisible();
  await page.getByRole('button', { name: 'Close history', exact: true }).click();
  await expect(history).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/chat\/$/);
});

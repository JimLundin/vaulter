import { expect, test } from '@playwright/test';

test('timeline jumps through one dialogue, preserves the draft, and retains context checkpoints after reload', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/?conversations');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(page.locator('[data-message="user"]').first()).toBeAttached();
  await input.fill('Keep my unsent draft');
  const openTimeline = async () => {
    const button = page.getByRole('button', { name: 'Timeline', exact: true });
    if (test.info().project.name === 'phone') await button.click();
    return page
      .getByRole('complementary', { name: 'Timeline', exact: true })
      .or(page.getByRole('dialog', { name: 'Timeline', exact: true }));
  };
  let timeline = await openTimeline();
  await expect(timeline).toBeVisible();
  // Use the first numbered exchange through the public timeline rows.
  const entry = timeline.locator('[data-selection-appearance]').first();
  await entry.click();
  await expect(input).toHaveValue('Keep my unsent draft');
  const anchor = page.locator('[data-scroll-anchor="0"]');
  await expect
    .poll(async () => {
      const top = await anchor.boundingBox();
      const viewport = await anchor
        .locator('xpath=ancestor::*[@data-slot="scroll-area-viewport"]')
        .boundingBox();
      return top && viewport ? Math.abs(top.y - viewport.y) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(32);
  timeline = await openTimeline();
  await timeline.getByRole('button', { name: 'Create checkpoint', exact: true }).click();
  await expect(timeline.getByRole('status')).toHaveText(
    'Checkpoint saved for future Agent context.',
  );
  await timeline.getByRole('button', { name: 'Conversation context', exact: true }).click();
  await expect(timeline).toContainText('consult the original conversation for exact wording');
  await timeline.getByRole('button', { name: 'Jump to this moment', exact: true }).click();
  await expect(input).toHaveValue('Keep my unsent draft');
  await page.reload();
  timeline = await openTimeline();
  await expect(
    timeline.getByRole('button', { name: 'Conversation context', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(0);
});

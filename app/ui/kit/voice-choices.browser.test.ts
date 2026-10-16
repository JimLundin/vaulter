import { expect, test } from '@playwright/test';

test('voice feedback and both supplied answer layouts remain usable without number hints', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Voice & choices');
  const family = page.locator('[data-kit-comparison="voice"]');
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    const starts = sample.getByRole('button', { name: 'Start voice interaction', exact: true });
    await expect(starts.first()).toBeEnabled();
    await expect(starts.last()).toBeDisabled();
    await expect(
      sample.getByRole('button', { name: 'Finish recording', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(sample.getByText('Connecting microphone…', { exact: true })).toBeVisible();
    await expect(sample.getByText('Finishing transcript…', { exact: true })).toBeVisible();
    await expect(sample.getByText('Ready to send', { exact: true })).toBeVisible();
    await expect(sample.getByRole('alert')).toHaveText(
      'The microphone disconnected. Your text remains in the message field.',
    );
    const keep = sample.getByRole('button', { name: 'Keep this thought', exact: true });
    const explore = sample.getByRole('button', { name: 'Explore a little more', exact: true });
    await keep.first().click();
    await expect(sample.getByText('List answer: keep', { exact: true })).toBeVisible();
    await explore.last().click();
    await expect(sample.getByText('Inline answer: explore', { exact: true })).toBeVisible();
    for (const choice of await keep.all()) {
      expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(
        device === 'mobile' ? 44 : 32,
      );
      await expect(choice.locator('kbd')).toHaveCount(0);
    }
    await expect(keep.first()).toHaveCSS(
      'border-color',
      await explore.last().evaluate((node) => getComputedStyle(node).borderColor),
    );
  }
});

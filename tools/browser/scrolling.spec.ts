import { expect, test } from '@playwright/test';

test('long kit samples have a visible scrollbar without hovering', async ({ page }) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Forms & fields');
  const sample = page.locator('[data-kit-comparison="fields"] [data-kit-preview="desktop"]');
  await sample.scrollIntoViewIfNeeded();
  const scrollbar = sample.locator('[data-slot="scroll-area-scrollbar"]');
  await expect(scrollbar).toBeVisible();
  expect((await scrollbar.boundingBox())!.width).toBeGreaterThanOrEqual(10);
  const viewport = sample.locator('[data-slot="scroll-area-viewport"]');
  await viewport.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(sample.getByRole('button', { name: 'Save preferences' })).toBeInViewport();
});

test('a full-height specimen does not create a tiny outer overflow', async ({ page }) => {
  await page.goto('/ui/kit/');
  const sample = page.locator('[data-kit-comparison="navigation"] [data-kit-preview="desktop"]');
  const content = sample.locator('.kit-specimen-content > [data-slot="scroll-area-viewport"]');
  await expect(content).toBeVisible();
  expect(await content.evaluate((node) => node.scrollHeight - node.clientHeight)).toBe(0);
});

test('paired canvases and inner scrolling samples have usable tracks and no extra scroll owner', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  await filter.fill('Scroll area');
  const family = page.locator('[data-kit-comparison="scrolling"]');
  await family.scrollIntoViewIfNeeded();
  const horizontal = family.locator('.kit-comparison-scroll > [data-orientation="horizontal"]');
  if (await family.locator('.kit-comparison-scroll').evaluate((node) => node.clientWidth < 1214)) {
    await expect(horizontal).toBeVisible();
    expect((await horizontal.boundingBox())!.height).toBe(12);
  }
  for (const device of ['desktop', 'mobile']) {
    const sample = family.locator(`[data-kit-preview="${device}"]`);
    const outer = sample.locator('.kit-specimen-content');
    await expect(outer.locator(':scope > [data-slot="scroll-area-scrollbar"]')).toHaveCount(0);
    const inner = sample.locator('.kit-sample > [data-slot="scroll-area"]');
    const track = inner.locator(':scope > [data-orientation="vertical"]');
    await expect(track).toBeVisible();
    expect((await track.boundingBox())!.width).toBe(12);
    const thumb = track.locator('[data-slot="scroll-area-thumb"]');
    expect((await thumb.boundingBox())!.height).toBeGreaterThan(20);
    expect((await thumb.boundingBox())!.height).toBeLessThan((await track.boundingBox())!.height);
    await inner.locator('[data-slot="scroll-area-viewport"]').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const viewport = (await inner.boundingBox())!;
    const last = (await inner
      .getByText('Note 30 · a thought for later', { exact: true })
      .boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(viewport.y + viewport.height);
    expect(last.y).toBeGreaterThanOrEqual(viewport.y);
  }
});

test('a short settings drawer scrolls its body while the close control stays reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 560 });
  await page.goto('/preview/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const track = dialog.locator('[data-slot="scroll-area-scrollbar"]');
  await expect(track).toBeVisible();
  expect((await track.boundingBox())!.width).toBe(12);
  const viewport = dialog.locator('[data-slot="scroll-area-viewport"]');
  await viewport.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(dialog.getByRole('textbox', { name: 'Model', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Close settings' })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});

test('the shared feed follows appended content and lets the reader scroll back', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page
    .getByRole('searchbox', { name: 'Find a component' })
    .fill('Following scroll primitive');
  const sample = page.locator(
    '[data-kit-comparison="following-primitive"] [data-kit-preview="desktop"]',
  );
  await sample.scrollIntoViewIfNeeded();
  const viewport = sample.locator('[data-slot="scroll-area-viewport"]').last();
  const distance = () =>
    viewport.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);
  await expect.poll(distance).toBeLessThan(4);
  await sample.getByRole('button', { name: 'Append item' }).click();
  await expect.poll(distance).toBeLessThan(4);
  await viewport.hover();
  await page.mouse.wheel(0, -3000);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBe(0);
  const latest = sample.getByRole('button', { name: 'Latest reply' });
  await expect(latest).toBeVisible();
  await sample.getByRole('button', { name: 'Append item' }).click();
  expect(await viewport.evaluate((node) => node.scrollTop)).toBe(0);
  await latest.click();
  await expect.poll(distance).toBeLessThan(4);
  await expect(latest).toBeHidden();
});

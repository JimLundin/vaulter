import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports Locator from playwright-core.
import type { Locator } from '@playwright/test';
import { choosePreviewDevice } from './preview-controls.ts';

async function chooseVariation(scope: Locator, name: string) {
  const picker = scope.getByRole('combobox', { name: 'Design variation', exact: true });
  if (await picker.count()) await picker.selectOption({ label: name });
  else await scope.getByRole('radio', { name, exact: true }).click();
}

test('paired preview comparisons select independently and preserve their selected design and draft through device changes', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Preview notice');
  const family = page.locator('[data-kit-comparison="preview"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  await chooseVariation(desktop, 'Question summary');
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  const draft = desktop.getByRole('textbox', { name: 'Preview draft' });
  await draft.fill('Keep this question draft');
  await draft.evaluate((node) => node.setAttribute('data-original-comparison-draft', ''));
  for (const device of ['Mobile', 'Desktop', 'Window']) {
    await choosePreviewDevice(desktop, device);
    await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
    await expect(draft).toHaveValue('Keep this question draft');
    await expect(draft).toHaveAttribute('data-original-comparison-draft', '');
    await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  }
  await chooseVariation(mobile, 'Question summary');
  await expect(mobile.getByRole('heading', { name: 'Question summary' })).toBeVisible();
});

test('comparison keyboard selection stays local and leaves text entry and device radio navigation usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Preview notice');
  const family = page.locator('[data-kit-comparison="preview"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  await desktop.getByRole('radio', { name: 'Note summary', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  const draft = desktop.getByRole('textbox', { name: 'Preview draft' });
  await draft.fill('draft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.insertText('!');
  await expect(draft).toHaveValue('draf!t');
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await desktop.getByRole('radio', { name: 'Window', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(desktop.getByRole('radio', { name: 'Desktop', exact: true })).toBeChecked();
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find a component' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
});

for (const retired of ['B', 'C', 'unknown']) {
  test(`retired evidence URL ${retired} opens the selected design without obsolete choices`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/preview/?variant=${retired}#/prototype/provenance/`);
    await expect(page.getByRole('heading', { name: 'Mira Holm' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Design variation' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Design variation' })).toHaveCount(0);
    const statement = page.getByRole('button', {
      name: 'She lives on Södermalm, in a flat on Katarina Bangata with a small balcony.',
      exact: true,
    });
    await statement.click();
    await expect(page.getByRole('heading', { name: 'Why the page says this' })).toBeVisible();
    await expect(page.getByText('Replaces', { exact: false })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('selected evidence keeps the same quoted context through device changes and returns focus to its claim', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/#/prototype/provenance/');
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  const statement = page.getByRole('button', {
    name: 'She lives on Södermalm, in a flat on Katarina Bangata with a small balcony.',
    exact: true,
  });
  await statement.click();
  const quote = page.getByText(
    "She's got the flat on Katarina Bangata now, the one with the tiny balcony.",
    {
      exact: true,
    },
  );
  await expect(quote).toBeVisible();
  await quote.evaluate((node) => node.setAttribute('data-original-evidence', ''));
  for (const device of ['Mobile', 'Desktop', 'Window']) {
    await choosePreviewDevice(banner, device);
    await expect(quote).toBeVisible();
    await expect(quote).toHaveAttribute('data-original-evidence', '');
    await expect(page.getByText('Replaces', { exact: false })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Close why the page says this', exact: true }).click();
  await expect(quote).toBeHidden();
  await expect(statement).toBeFocused();
  await page.setViewportSize({ width: 800, height: 1000 });
  await statement.click();
  const evidence = page.getByRole('complementary', { name: 'Why the page says this' });
  await expect(evidence).toBeVisible();
  const articleBounds = (await page.getByRole('heading', { name: 'Mira Holm' }).boundingBox())!;
  const evidenceBounds = (await evidence.boundingBox())!;
  expect(evidenceBounds.x).toBeGreaterThan(articleBounds.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Why the page says this' })).toBeVisible();
  const close = page.getByRole('button', { name: 'Close why the page says this', exact: true });
  const closeBounds = (await close.boundingBox())!;
  expect(closeBounds.width).toBeGreaterThanOrEqual(44);
  expect(closeBounds.height).toBeGreaterThanOrEqual(44);
  await close.focus();
  await page.keyboard.press('Escape');
  await expect(quote).toBeHidden();
  await expect(statement).toBeFocused();
});

test('paired selected evidence stays bounded, independent and shows exact source provenance', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Wiki provenance');
  const family = page.locator('[data-kit-comparison="provenance"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  await expect(family.getByRole('combobox', { name: 'Design variation' })).toHaveCount(0);
  await expect(family.getByRole('radiogroup', { name: 'Design variation' })).toHaveCount(0);
  const claim = mobile.getByRole('button', {
    name: 'She lives on Södermalm, in a flat on Katarina Bangata with a small balcony.',
    exact: true,
  });
  await claim.click();
  const phoneEvidence = mobile.getByRole('dialog', { name: 'Why the page says this', exact: true });
  await expect(phoneEvidence.getByText('Replaces', { exact: false })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    // A browser focus reveal must scroll content, never the clipping specimen frame.
    await mobile.evaluate((node) => {
      node.scrollTop = 33;
    });
    await expect
      .poll(async () =>
        mobile.evaluate((node) => {
          const outer = node.getBoundingClientRect();
          const inner = node.querySelector('[role="dialog"]')!.getBoundingClientRect();
          return (
            inner.x >= outer.x &&
            inner.y >= outer.y &&
            inner.right <= outer.right &&
            inner.bottom <= outer.bottom
          );
        }),
      )
      .toBe(true);
  }
  await phoneEvidence
    .getByRole('button', { name: 'Close why the page says this', exact: true })
    .click();
  await expect(claim).toBeFocused();
  await expect(phoneEvidence).toBeHidden();
  await expect(desktop.getByRole('heading', { name: 'Why the page says this' })).toBeVisible();
  const studio = desktop.getByRole('button', {
    name: 'She runs Holm Keramik AB, a small studio that makes and sells ceramics and teaches classes.',
    exact: true,
  });
  await studio.click();
  await expect(
    desktop.getByText('Manufacture and sale of ceramic goods, and teaching of ceramics.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    desktop.getByRole('link', { name: 'Holm Keramik AB – company extract' }).first(),
  ).toBeVisible();
  await expect(
    desktop.getByText('Found by searching “Holm keramik aktiebolag Stockholm Mira Holm”').first(),
  ).toBeVisible();
});

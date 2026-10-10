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

test('provenance uses the shared bounded comparison without interfering with another preview', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Wiki provenance');
  const family = page.locator('[data-kit-comparison="provenance"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  await chooseVariation(desktop, 'B · Sidenotes');
  await expect(desktop.getByRole('heading', { name: 'Mira Holm' })).toBeVisible();
  await expect(desktop.getByText('Person · 7 sourced statements', { exact: true })).toBeVisible();
  await chooseVariation(desktop, 'C · Trace');
  await expect(desktop.getByRole('heading', { name: 'Mira Holm' })).toBeVisible();
  await chooseVariation(mobile, 'B · Sidenotes');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(desktop.getByRole('radio', { name: 'C · Trace', exact: true })).toBeChecked();
    await expect(mobile.getByRole('combobox', { name: 'Design variation' })).toHaveValue('B');
    for (const sample of [desktop, mobile]) {
      const outer = (await sample.boundingBox())!;
      const controls = (await sample.getByText('Design variation', { exact: true }).boundingBox())!;
      expect(controls.x).toBeGreaterThanOrEqual(outer.x);
      expect(controls.y).toBeGreaterThanOrEqual(outer.y);
      expect(controls.x + controls.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(controls.y + controls.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  }
  await chooseVariation(desktop, 'A · Side panel / phone drawer');
  await expect(desktop.getByText('Why the page says this', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
});

test('the Product evidence preview keeps variation and evidence context through device selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preview/#/prototype/provenance/');
  const banner = page.getByRole('complementary', { name: 'Design preview' });
  await chooseVariation(page.locator('body'), 'B · Sidenotes');
  await expect(page.getByText('Person · 7 sourced statements', { exact: true })).toBeVisible();
  await choosePreviewDevice(banner, 'Mobile');
  await expect(page.getByRole('combobox', { name: 'Design variation' })).toHaveValue('B');
  await choosePreviewDevice(banner, 'Desktop');
  await expect(page.getByRole('radio', { name: 'B · Sidenotes' })).toBeChecked();
  await chooseVariation(page.locator('body'), 'A · Side panel / phone drawer');
  await expect(page.getByText('Why the page says this', { exact: true })).toBeVisible();
  await expect(page.getByText('Replaces', { exact: false })).toBeVisible();
  await choosePreviewDevice(banner, 'Mobile');
  const evidence = page.getByRole('dialog', { name: 'Why the page says this', exact: true });
  await expect(evidence).toBeVisible();
  await expect(evidence.getByText('Replaces', { exact: false })).toBeVisible();
  await evidence.getByRole('button', { name: 'Close why the page says this', exact: true }).click();
  await expect(evidence).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Design variation' })).toHaveValue('A');
});

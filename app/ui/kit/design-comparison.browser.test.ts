import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports Locator from playwright-core.
import type { Locator } from '@playwright/test';
import { setPreviewMobile } from './preview.browser.test-support.ts';

async function chooseVariation(scope: Locator, name: string) {
  const toggle = scope.getByRole('button', { name: 'Preview controls', exact: true }).first();
  if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) === 'false')
    await toggle.click();
  const picker = scope.getByRole('button', { name: 'Design variation', exact: true });
  if (!(await picker.innerText()).includes(name))
    await scope.getByRole('button', { name: 'Next design', exact: true }).click();
  await expect(picker).toContainText(name);
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
  const banner = desktop.getByRole('complementary', { name: 'Design preview' }).first();
  await expect(banner.getByRole('button', { name: 'Design variation', exact: true })).toContainText(
    'Question summary',
  );
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  const draft = desktop.getByRole('textbox', { name: 'Preview draft' });
  await draft.fill('Keep this question draft');
  await draft.evaluate((node) => node.setAttribute('data-original-comparison-draft', ''));
  for (const device of [true, false, true, false]) {
    await setPreviewMobile(desktop, device);
    await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
    await expect(draft).toHaveValue('Keep this question draft');
    await expect(draft).toHaveAttribute('data-original-comparison-draft', '');
    await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  }
  await chooseVariation(mobile, 'Question summary');
  await expect(mobile.getByRole('heading', { name: 'Question summary' })).toBeVisible();
});

test('comparison keyboard selection stays local and leaves text entry and the Mobile toggle usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Preview notice');
  const family = page.locator('[data-kit-comparison="preview"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  const focusedDesign = desktop.getByRole('button', { name: 'Design variation', exact: true });
  await focusedDesign.focus();
  await page.keyboard.press('ArrowRight');
  await expect(focusedDesign).toBeFocused();
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  const draft = desktop.getByRole('textbox', { name: 'Preview draft' });
  await draft.fill('draft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.insertText('!');
  await expect(draft).toHaveValue('draf!t');
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  const mobileToggle = desktop.getByRole('button', { name: 'Mobile', exact: true });
  await mobileToggle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(mobileToggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(mobileToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find a component' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(desktop.getByRole('heading', { name: 'Question summary' })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Note summary' })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
});

test('paired module evidence stays bounded and independent through device changes', async ({
  page,
}) => {
  await page.goto('/preview/records.html');
  const desktop = page.getByRole('region', { name: 'Desktop Wiki example', exact: true });
  const mobile = page.getByRole('region', { name: 'Mobile Wiki example', exact: true });
  const claim = mobile.getByRole('button', {
    name: 'Evidence for Keep mornings free.',
    exact: true,
  });
  await claim.click();
  const evidence = mobile.getByRole('dialog', { name: 'References', exact: true });
  await expect(evidence.locator('mark')).toHaveText('Keep mornings free.');
  await expect(evidence).toContainText('Source has a newer version.');
  await mobile.getByRole('button', { name: 'Context from Studio plans' }).click();
  await expect(desktop.getByLabel('Source context').locator('mark')).toHaveCount(0);
  await expect(desktop.getByRole('button', { name: 'Context from Studio plans' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(async () =>
        mobile.evaluate((node) => {
          const outer = node.querySelector('[data-kit-preview]')!.getBoundingClientRect();
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
  await evidence.getByRole('button', { name: 'Close references', exact: true }).click();
  await expect(claim).toBeFocused();
  await desktop
    .getByRole('button', { name: 'Evidence for Afternoons are flexible.', exact: true })
    .click();
  await expect(desktop.getByLabel('Source context').locator('mark')).toHaveText(
    'Afternoons are flexible.',
  );
  await expect(
    desktop.getByText('Source was removed. This excerpt stays tied to the original.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(mobile.getByRole('dialog', { name: 'References', exact: true })).toHaveCount(0);
  await desktop
    .getByRole('toolbar', { name: 'Wiki page' })
    .getByRole('button', { name: 'Wiki', exact: true })
    .click();
  await expect(desktop.getByRole('textbox', { name: 'Find pages' })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  await desktop
    .getByRole('region', { name: 'Page directory' })
    .getByRole('link', { name: 'Slow mornings', exact: true })
    .click();
  await expect(desktop.getByRole('heading', { name: 'Slow mornings', exact: true })).toBeVisible();
  await expect(mobile.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
});

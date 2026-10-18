import { expect } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports these browser types.
import type { Page } from '@playwright/test';

/** Exercise the same app action through the sidebar or the compact Modules menu. */
export async function openAppAction(page: Page, name: string) {
  await expect(page.locator('[data-layout$="-workspace"]')).toBeVisible();
  const modules = page.getByRole('button', { name: 'Modules', exact: true });
  if (await modules.isVisible()) {
    if ((await modules.getAttribute('aria-expanded')) !== 'true') await modules.click();
    await page
      .getByRole('menu', { name: 'App navigation', exact: true })
      .getByRole('menuitem', { name, exact: true })
      .click();
  } else {
    await page.getByRole('button', { name, exact: true }).click();
  }
}

export async function navigateToModule(page: Page, name: string) {
  await expect(page.locator('[data-layout$="-workspace"]')).toBeVisible();
  const modules = page.getByRole('button', { name: 'Modules', exact: true });
  if (await modules.isVisible()) {
    await modules.click();
    await page
      .getByRole('menu', { name: 'App navigation', exact: true })
      .getByRole('menuitem', { name, exact: true })
      .click();
  } else {
    await page.getByRole('link', { name, exact: true }).click();
  }
}

export async function expectAppActionFocus(page: Page, name: string) {
  const modules = page.getByRole('button', { name: 'Modules', exact: true });
  await expect(
    (await modules.isVisible()) ? modules : page.getByRole('button', { name, exact: true }),
  ).toBeFocused();
}

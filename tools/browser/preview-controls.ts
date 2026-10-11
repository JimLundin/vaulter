// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports these browser types.
import type { Locator } from '@playwright/test';

export async function setPreviewMobile(scope: Locator, mobile: boolean) {
  const toggle = scope.getByRole('button', { name: 'Preview controls', exact: true }).first();
  if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) === 'false')
    await toggle.click();
  const control = scope.getByRole('button', { name: 'Mobile', exact: true }).first();
  if ((await control.getAttribute('aria-pressed')) !== String(mobile)) await control.click();
}

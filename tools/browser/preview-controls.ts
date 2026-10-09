// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports these browser types.
import type { Locator } from '@playwright/test';

export async function choosePreviewDevice(scope: Locator, name: string) {
  const picker = scope.getByRole('combobox', { name: 'Preview device', exact: true });
  if (await picker.count()) await picker.selectOption(name.toLowerCase());
  else await scope.getByRole('radio', { name, exact: true }).click();
}

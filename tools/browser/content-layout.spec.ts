import { expect, test } from '@playwright/test';

test('two and three content columns always stack on phones and keep their fields through resize', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/controls.html');
  const first = page.getByRole('textbox', { name: 'Two-column first', exact: true });
  await first.fill('An edited column');
  for (const width of [390, 768, 1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(first).toHaveValue('An edited column');
    await expect(first).toBeFocused();
    for (const count of ['Two', 'Three']) {
      const left = (await page
        .getByRole('textbox', { name: `${count}-column first`, exact: true })
        .boundingBox())!;
      const right = (await page
        .getByRole('textbox', { name: `${count}-column second`, exact: true })
        .boundingBox())!;
      if (width < 768) {
        expect(right.y).toBeGreaterThanOrEqual(left.y + left.height);
        expect(right.x).toBe(left.x);
        expect(right.width).toBe(left.width);
      } else {
        expect(right.y).toBe(left.y);
        expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
        expect(right.width).toBeCloseTo(left.width, 0);
      }
    }
  }
});

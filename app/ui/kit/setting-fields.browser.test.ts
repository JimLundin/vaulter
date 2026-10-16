import { expect, test } from '@playwright/test';

function luminance(rgb: number[]) {
  return rgb
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?setting-fields');
  await page.getByRole('button', { name: 'Open field settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
});

test('setting fields stack in a narrow container on a wide screen and retain their native control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const select = page.getByRole('combobox', { name: 'Selected model', exact: true });
  await select.selectOption('fast');
  const identity = await select.getAttribute('id');
  for (const width of [280, 760, 320]) {
    await select.evaluate((element, pixels) => {
      const field = element.closest<HTMLElement>('[data-orientation="setting"]')!;
      field.parentElement!.style.width = `${pixels}px`;
    }, width);
    await select.scrollIntoViewIfNeeded();
    const label = page.getByText('Selected model', { exact: true });
    const control = (await select.boundingBox())!;
    const title = (await label.boundingBox())!;
    if (width < 560) {
      expect(control.y).toBeGreaterThanOrEqual(title.y + title.height);
      expect(control.width).toBeCloseTo(width, 0);
    } else {
      expect(control.x).toBeGreaterThan(title.x + title.width);
    }
    await label.click();
    await expect(select).toBeFocused();
    await expect(select).toHaveValue('fast');
    await expect(select).toHaveAttribute('id', identity!);
  }
});

test(
  'open native dropdown options stay readable when device and app themes disagree',
  {
    tag: '@phone',
  },
  async ({ page }, testInfo) => {
    const select = page.getByRole('combobox', { name: 'Selected model', exact: true });
    const theme = page.getByRole('radiogroup', { name: 'Field theme', exact: true });
    for (const system of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: system });
      for (const choice of ['Dark', 'Light', 'Dark'] as const) {
        await theme.getByRole('radio', { name: choice, exact: true }).click();
        await select.scrollIntoViewIfNeeded();
        const foreground = choice === 'Dark' ? 'rgb(250, 250, 250)' : 'rgb(24, 24, 27)';
        await expect(select).toHaveCSS('color', foreground);
        await expect(select).toHaveCSS('color-scheme', choice.toLowerCase());
        const option = select.locator('option').nth(1);
        await expect(option).toHaveCSS('color', foreground);
        await expect(option).toHaveCSS(
          'background-color',
          choice === 'Dark' ? 'rgb(24, 24, 27)' : 'rgb(255, 255, 255)',
        );
        const box = (await select.boundingBox())!;
        await select.click();
        const screenshot = await page.screenshot();
        await testInfo.attach(`${system}-device-${choice}-app-native-menu`, {
          body: screenshot,
          contentType: 'image/png',
        });
        const background = await page.evaluate(
          async ({ encoded, x, y }) => {
            const image = new Image();
            image.src = `data:image/png;base64,${encoded}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            return Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
          },
          {
            encoded: screenshot.toString('base64'),
            // This Chromium fixture opens downward; sample the second option away from its text.
            x: Math.round(box.x + box.width - 12),
            y: Math.round(box.y + box.height + 35),
          },
        );
        const levels = [
          luminance(foreground.match(/\d+/g)!.map(Number)),
          luminance(background),
        ].sort((a, b) => a - b);
        const contrast = (levels[1] + 0.05) / (levels[0] + 0.05);
        expect(contrast, `${choice} open option text contrast`).toBeGreaterThanOrEqual(4.5);
        await page.keyboard.press('Escape');
        await expect(select).toBeFocused();
        await select.press('ArrowDown');
        await expect(select).toHaveValue('fast');
        await select.selectOption('balanced');
      }
    }
  },
);

test('native dropdowns own label focus and keyboard selection through resize and reopening', {
  tag: '@phone',
}, async ({ page }) => {
  const select = page.getByRole('combobox', { name: 'Selected model', exact: true });
  await expect(select).toHaveAccessibleDescription('Used for future conversations.');
  await expect(select).toHaveValue('balanced');
  await page.getByText('Selected model', { exact: true }).click();
  await expect(select).toBeFocused();
  await select.press('ArrowDown');
  await expect(select).toHaveValue('fast');
  await expect(page.getByRole('status', { name: 'Selected model value' })).toHaveText('fast');
  for (const width of [390, 1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(select).toBeFocused();
    await expect(select).toHaveValue('fast');
    await expect(select).toHaveAccessibleDescription('Used for future conversations.');
  }
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.getByRole('button', { name: 'Open field settings', exact: true }).click();
  await expect(select).toHaveValue('fast');
});

test('disabled dropdowns retain native unavailability and touch targets', {
  tag: '@phone',
}, async ({ page, isMobile }) => {
  const select = page.getByRole('combobox', { name: 'Unavailable model', exact: true });
  await expect(select).toBeDisabled();
  await expect(select).toHaveAccessibleDescription('Selection is unavailable.');
  await expect(select).toHaveCSS('opacity', '0.5');
  if (isMobile) expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('a text field owns its accessible name, description and native label activation', {
  tag: '@phone',
}, async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Default model', exact: true });
  await expect(input).toHaveAccessibleName('Default model');
  await expect(input).toHaveAccessibleDescription('Used for new conversations.');
  await page.getByText('Default model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('explicit text identities remain valid and the visible field name takes precedence', {
  tag: '@phone',
}, async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Identified model', exact: true });
  await expect(input).toHaveAttribute('id', 'identified-model');
  await expect(input).toHaveAccessibleDescription('An existing reference still works.');
  await page.getByText('Identified model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('nested grouped inputs retain additional descriptions without duplicate references', {
  tag: '@phone',
}, async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Nested model', exact: true });
  await expect(input).toHaveAccessibleDescription(
    'Additional model guidance. Use the recommended model.',
  );
  const references = (await input.getAttribute('aria-describedby'))!.split(/\s+/);
  expect(references).toHaveLength(2);
  expect(new Set(references).size).toBe(2);
  await page.getByText('Nested model', { exact: true }).click();
  await expect(input).toBeFocused();
});

test('repeated labels target independent fields and preserve editing across resizing', {
  tag: '@phone',
}, async ({ page }) => {
  const first = page.getByRole('textbox', { name: 'First repeated model', exact: true });
  const second = page.getByRole('textbox', { name: 'Second repeated model', exact: true });
  const firstIdentity = await first.getAttribute('id');
  const secondIdentity = await second.getAttribute('id');
  expect(firstIdentity).toBeTruthy();
  expect(secondIdentity).toBeTruthy();
  expect(firstIdentity).not.toBe(secondIdentity);
  await page.getByText('First repeated model', { exact: true }).click();
  await expect(first).toBeFocused();
  await first.fill('An edited value');
  for (const width of [390, 1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(first).toBeFocused();
    await expect(first).toHaveValue('An edited value');
    await expect(first).toHaveAttribute('id', firstIdentity!);
    await expect(first).toHaveAccessibleDescription('Each field keeps its own meaning.');
  }
  await page.getByText('Second repeated model', { exact: true }).click();
  await expect(second).toBeFocused();
  await expect(first).not.toBeFocused();
  await expect(second).toHaveValue('Separate value');
  await expect(second).toHaveAttribute('id', secondIdentity!);
});

test('standalone inputs retain their own identities, names and descriptions', {
  tag: '@phone',
}, async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Standalone model', exact: true });
  await expect(input).toHaveAttribute('id', 'standalone-model');
  await expect(input).toHaveAccessibleDescription('Standalone instructions.');
});

test('a nested textarea receives field meaning and native label activation', {
  tag: '@phone',
}, async ({ page }) => {
  const notes = page.getByRole('textbox', { name: 'Conversation notes', exact: true });
  await expect(notes).toHaveAccessibleDescription('Keep context for the next message.');
  await page.getByText('Conversation notes', { exact: true }).click();
  await expect(notes).toBeFocused();
});

test('field theme choices have group meaning and standalone Appearance retains its name', {
  tag: '@phone',
}, async ({ page }) => {
  const group = page.getByRole('radiogroup', { name: 'Field theme', exact: true });
  await expect(group).toHaveAccessibleDescription('Choose how this device looks.');
  await expect(
    group.getByRole('radio', { name: 'As the system', exact: true }),
  ).toHaveAccessibleName('As the system');
  for (const choice of ['Light', 'Dark']) {
    await expect(
      group.getByRole('radio', { name: choice, exact: true }),
    ).toHaveAccessibleDescription('');
  }
  await expect(page.getByRole('radiogroup', { name: 'Appearance', exact: true })).toBeVisible();
});

test('nested repeated groups retain independent associations and radio keyboard behavior through resizing', {
  tag: '@phone',
}, async ({ page }) => {
  const first = page.getByRole('radiogroup', { name: 'First mode', exact: true });
  const second = page.getByRole('radiogroup', { name: 'Second mode', exact: true });
  expect(await first.getAttribute('id')).not.toBe(await second.getAttribute('id'));
  expect(await first.getAttribute('aria-describedby')).not.toBe(
    await second.getAttribute('aria-describedby'),
  );
  for (const group of [first, second]) {
    await expect(group).toHaveAccessibleDescription('Additional mode guidance. Choose one mode.');
    const references = (await group.getAttribute('aria-describedby'))!.split(/\s+/);
    expect(new Set(references).size).toBe(2);
  }
  await first.getByRole('radio', { name: 'One', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  const selected = first.getByRole('radio', { name: 'Two', exact: true });
  await expect(selected).toBeChecked();
  await expect(selected).toBeFocused();
  for (const width of [390, 1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(selected).toBeChecked();
    await expect(selected).toBeFocused();
    await expect(first).toHaveAccessibleDescription('Additional mode guidance. Choose one mode.');
  }
  await expect(second.getByRole('radio', { name: 'One', exact: true })).toBeChecked();
});

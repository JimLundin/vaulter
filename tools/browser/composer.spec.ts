import { expect, test } from '@playwright/test';

test('longform entry reserves floating-control space before focus, after blur and while saving through viewport changes', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/tests/browser.html?composer&longform&rail');
  const field = page.getByRole('textbox', { name: 'Fixture answer', exact: true });
  const entry = page.getByRole('group', { name: 'Fixture answer text box', exact: true });
  const rail = page.getByRole('navigation', { name: 'App controls', exact: true });
  await expect(rail).toBeVisible();
  await expect(field).not.toBeFocused();
  for (const state of ['empty', 'draft', 'saving']) {
    if (state === 'draft') {
      await field.fill('Keep a longer answer through blur and saving.');
      await field.blur();
    }
    if (state === 'saving') await page.getByRole('button', { name: 'Begin response' }).click();
    const action = entry.getByRole('button', {
      name: state === 'saving' ? 'Saving answer…' : 'Save answer',
      exact: true,
    });
    for (const [width, height, top, left] of [
      [390, 844, 0, 0],
      [320, 430, 72, 8],
      [430, 340, 100, 0],
    ]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(
        ({ width, height, top, left }) => {
          Object.defineProperties(window.visualViewport!, {
            width: { configurable: true, get: () => width - left },
            height: { configurable: true, get: () => height },
            offsetTop: { configurable: true, get: () => top },
            offsetLeft: { configurable: true, get: () => left },
          });
          window.visualViewport!.dispatchEvent(new Event('resize'));
          window.visualViewport!.dispatchEvent(new Event('scroll'));
        },
        { width, height, top, left },
      );
      await action.scrollIntoViewIfNeeded();
      await expect
        .poll(async () => {
          const surface = (await entry.boundingBox())!;
          const navigation = (await rail.boundingBox())!;
          const target = (await action.boundingBox())!;
          return (
            surface.x + surface.width <= navigation.x - 11 &&
            target.x + target.width <= surface.x + surface.width &&
            target.width >= 44 &&
            target.height >= 44
          );
        })
        .toBe(true);
      await expect(field).not.toBeFocused();
      if (state !== 'empty')
        await expect(field).toHaveValue('Keep a longer answer through blur and saving.');
    }
  }
  await expect(field).toBeDisabled();
});

test('text-box descriptions and validation errors name both the field and its submission action', async ({
  page,
}) => {
  for (const longform of [false, true]) {
    await page.goto(`/ui/kit/tests/browser.html?composer${longform ? '&longform' : ''}`);
    const field = page.getByRole('textbox', {
      name: longform ? 'Fixture answer' : 'Fixture message',
      exact: true,
    });
    await field.fill('A draft to review');
    await page.getByRole('button', { name: 'Show validation error' }).click();
    await field.focus();
    const description =
      'The owner keeps this draft until it is accepted. Review the wording before submitting.';
    await expect(field).toHaveAccessibleDescription(description);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByRole('button', { name: longform ? 'Save answer' : 'Send', exact: true }),
    ).toHaveAccessibleDescription(description);
    await expect(page.getByRole('alert')).toHaveText('Review the wording before submitting.');
    await expect(field).toHaveValue('A draft to review');
  }
});

test('longform entry keeps Enter as editing and saves explicitly without clearing the controlled draft', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?composer&longform');
  const field = page.getByRole('textbox', { name: 'Fixture answer', exact: true });
  await field.fill('First line');
  expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(112);
  await field.press('End');
  await field.press('Enter');
  await expect(field).toHaveValue('First line\n');
  await expect(page.getByText('Submitted drafts: []', { exact: true })).toBeVisible();
  await field.fill('First line\nA considered answer');
  await page.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(
    page.getByText('Submitted drafts: ["First line\\nA considered answer"]', { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue('First line\nA considered answer');
  await page.getByRole('button', { name: 'Begin response' }).click();
  await expect(field).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving answer…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await field.evaluate((node) => node.closest('form')?.requestSubmit());
  await expect(
    page.getByText('Submitted drafts: ["First line\\nA considered answer"]', { exact: true }),
  ).toBeVisible();
});

test('the controlled TextBox reports edits and each Enter or Send once without clearing its owner’s draft', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  await expect(field).toHaveAttribute('placeholder', 'Write a controlled draft');
  await field.fill('First thought');
  await field.press('Enter');
  await expect(
    page.getByText('Submitted drafts: ["First thought"]', { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue('First thought');
  await field.fill('An edited thought');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByText('Submitted drafts: ["First thought","An edited thought"]', { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue('An edited thought');
});

test('Shift+Enter and native or Safari composition keep editing in the controlled one-row field', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  await field.fill('First line');
  const before = (await field.boundingBox())!;
  await field.press('End');
  await field.press('Shift+Enter');
  await expect(field).toHaveValue('First line\n');
  await expect(field).toHaveAttribute('rows', '1');
  expect((await field.boundingBox())!.height).toBe(before.height);
  await field.fill('Composed text');
  await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await field.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
  await expect(field).toHaveValue('Composed text');
  await expect(page.getByText('Submitted drafts: []', { exact: true })).toBeVisible();
});

test('empty, whitespace and caller-denied drafts cannot submit and unhandled Enter stays an editing action', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  const send = page.getByRole('button', { name: 'Send', exact: true });
  await field.focus();
  await expect(send).toBeDisabled();
  await field.fill('   ');
  await field.press('End');
  await field.press('Enter');
  await expect(field).toHaveValue('   \n');
  await expect(send).toBeDisabled();
  await field.fill('A retained thought');
  await page.getByRole('button', { name: 'Deny submission' }).click();
  await expect(send).toBeHidden();
  await field.focus();
  await expect(send).toBeDisabled();
  await field.press('End');
  await field.press('Enter');
  await expect(field).toHaveValue('A retained thought\n');
  // Native form submissions also go through the shared eligibility check.
  await field.evaluate((node) => node.closest('form')?.requestSubmit());
  await expect(page.getByText('Submitted drafts: []', { exact: true })).toBeVisible();
});

test('capture blocks submission and a busy response exposes only its explicit Stop action', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  await field.fill('Words to preserve');
  for (const phase of ['connecting', 'listening', 'finishing']) {
    await page.getByRole('button', { name: `${phase} capture` }).click();
    await expect(field).toHaveAttribute('readonly');
    await expect(field).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeHidden();
    await expect(
      page.getByRole('group', { name: 'Fixture message text box' }).getByRole('button'),
    ).toHaveCount(1);
    await field.dispatchEvent('keydown', { key: 'Enter', bubbles: true });
    await field.evaluate((node) => node.closest('form')?.requestSubmit());
    await expect(field).toHaveValue('Words to preserve');
  }
  await page.getByRole('button', { name: 'idle capture' }).click();
  await page.getByRole('button', { name: 'Start voice interaction' }).click();
  await expect(page.getByRole('button', { name: 'Finish recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await page.getByRole('button', { name: 'Begin response' }).click();
  await expect(field).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveAttribute(
    'data-variant',
    'outline',
  );
  await field.dispatchEvent('keydown', { key: 'Enter', bubbles: true });
  await field.evaluate((node) => node.closest('form')?.requestSubmit());
  await expect(page.getByText('Stop actions: 0', { exact: true })).toBeVisible();
  await expect(page.getByText('Submitted drafts: []', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('Stop actions: 1', { exact: true })).toBeVisible();
  await expect(field).toBeEditable();
  await expect(field).toHaveValue('Words to preserve');
});

test('the supported reference focuses suggestions and focus observation matches the send icon', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/ui/kit/tests/browser.html?composer');
  const field = page.getByRole('textbox', { name: 'Fixture message' });
  const icon = page.getByRole('button', { name: 'Send', exact: true }).locator('svg');
  await expect(icon).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeVisible();
  await page.getByRole('button', { name: 'Use suggested thought' }).click();
  await expect(field).toHaveValue('A suggested thought');
  await expect(field).toBeFocused();
  await expect(icon).toHaveClass(/lucide-corner-down-left/);
  await expect(page.getByText('Field focused: true', { exact: true })).toBeVisible();
  await field.evaluate((node) => node.setAttribute('data-original-field', ''));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(field).toHaveAttribute('data-original-field', '');
  await expect(field).toBeFocused();
  await page.getByRole('button', { name: 'Deny submission' }).focus();
  await expect(icon).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start voice interaction' })).toBeVisible();
  await expect(page.getByText('Field focused: false', { exact: true })).toBeVisible();
});

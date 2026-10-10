import { expect, test } from '@playwright/test';

for (const childTitle of ['Supporting review', 'Supporting details']) {
  test(`paired panels dismiss their active nested ${childTitle.toLowerCase()} independently`, async ({
    page,
  }) => {
    await page.goto('/ui/kit/');
    await page.getByRole('searchbox', { name: 'Find a component' }).fill('AdaptivePanel');
    const family = page.locator('[data-kit-comparison="panel-primitive"]');
    const desktop = family.locator('[data-kit-preview="desktop"]');
    const mobile = family.locator('[data-kit-preview="mobile"]');
    for (const sample of [desktop, mobile])
      await sample.getByRole('button', { name: 'Open adaptive panel' }).click();
    const parent = mobile.getByRole('dialog', { name: 'Supporting content', exact: true });
    await parent
      .getByRole('button', {
        name:
          childTitle === 'Supporting review'
            ? 'Review supporting draft'
            : 'Open supporting details',
      })
      .click();
    const child = mobile.getByRole('dialog', { name: childTitle, exact: true });
    await expect(child).toBeVisible();
    await desktop.getByRole('textbox', { name: 'Supporting draft' }).fill('Desktop task');
    await page.keyboard.press('Escape');
    await expect(
      desktop.getByRole('dialog', { name: 'Supporting content', exact: true }),
    ).toBeHidden();
    await expect(child).toBeVisible();
    await child.getByRole('textbox').fill('Mobile child task');
    await page.keyboard.press('Escape');
    await expect(child).toBeHidden();
    await expect(parent).toBeVisible();
    await parent.getByRole('textbox', { name: 'Supporting draft' }).fill('Mobile parent continues');
    await page.keyboard.press('Escape');
    await expect(parent).toBeHidden();
    await expect(mobile.getByRole('button', { name: 'Open adaptive panel' })).toBeFocused();
  });
}

for (const targetWidth of [1440, 900]) {
  test(`a nested review retains its task while its panel becomes ${targetWidth === 1440 ? 'wide' : 'modal'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: targetWidth === 1440 ? 900 : 1440, height: 844 });
    await page.goto('/ui/kit/tests/browser.html');
    await page.getByRole('button', { name: 'Open agent', exact: true }).click();
    const draft = page.getByRole('textbox', { name: 'Panel draft' });
    await draft.fill('Keep parent draft');
    const original = await draft.elementHandle();
    await page.getByRole('button', { name: 'Review in panel' }).click();
    const child = page.getByRole('dialog', { name: 'Review', exact: true });
    const childDraft = child.getByRole('textbox', { name: 'Review draft' });
    await childDraft.fill('Keep child draft');
    await page.setViewportSize({ width: targetWidth, height: 844 });
    await expect(childDraft).toBeFocused();
    await expect(childDraft).toHaveValue('Keep child draft');
    await expect(page.getByRole('textbox', { name: 'Preference' })).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(child).toBeHidden();
    await expect(page.getByRole('button', { name: 'Review in panel' })).toBeFocused();
    expect(
      await original!.evaluate(
        (node) => node === document.querySelector('[aria-label="Panel draft"]'),
      ),
    ).toBe(true);
    await expect(draft).toHaveValue('Keep parent draft');
    const background = page.getByRole('textbox', { name: 'Preference' });
    if (targetWidth === 1440) {
      await expect(background).toBeVisible();
      await background.fill('Background available beside wide panel');
      await expect(background).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
      await draft.focus();
    } else {
      await expect(background).toBeHidden();
      const parent = page.getByRole('dialog', { name: 'Agent', exact: true });
      for (let step = 0; step < 6; step++) {
        await page.keyboard.press('Tab');
        // Base UI returns focus from its guard on the next animation frame.
        await expect
          .poll(() => parent.evaluate((node) => node.contains(document.activeElement)))
          .toBe(true);
      }
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    }
    await page.keyboard.press('Escape');
    await expect(draft).toBeHidden();
    await expect(background).toBeVisible();
    await background.fill('Background available after final closure');
  });
}

test('closing a review skips a disabled opener and restores useful focus in its scope', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?policy');
  const background = page.getByRole('textbox', { name: 'Background draft' });
  await background.fill('Continue this task');
  const opener = page.getByRole('button', { name: 'Open standalone review' });
  await opener.click();
  const review = page.getByRole('dialog', { name: 'Standalone review' });
  await review.getByRole('button', { name: 'Disable opening control' }).click();
  await page.keyboard.press('Escape');
  await expect(review).toBeHidden();
  await expect(opener).toBeDisabled();
  await expect(background).toBeFocused();
  await expect(background).toHaveValue('Continue this task');
});

test('closing a review skips an invisible opener and restores the previous task control', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?policy');
  const background = page.getByRole('textbox', { name: 'Background draft' });
  await background.fill('Continue after rearrangement');
  const opener = page.getByRole('button', {
    name: 'Open standalone review',
    includeHidden: true,
  });
  await opener.click();
  const review = page.getByRole('dialog', { name: 'Standalone review' });
  await opener.evaluate((node) => {
    node.style.visibility = 'hidden';
  });
  await page.keyboard.press('Escape');
  await expect(review).toBeHidden();
  await expect(background).toBeFocused();
  await expect(background).toHaveValue('Continue after rearrangement');
});

test('a nested review closes before its drawer and leaves the parent usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui/kit/tests/browser.html');
  await page.getByRole('button', { name: 'Open agent', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Agent', exact: true });
  await parent.getByRole('textbox', { name: 'Panel draft' }).fill('Retain this task');
  await parent.getByRole('button', { name: 'Review in panel' }).click();
  const child = page.getByRole('dialog', { name: 'Review', exact: true });
  await expect(child).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(child).toBeHidden();
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Review in panel' })).toBeFocused();
  await expect(parent.getByRole('textbox', { name: 'Panel draft' })).toHaveValue(
    'Retain this task',
  );
  await page.keyboard.press('Tab');
  expect(await parent.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(parent).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open agent', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Preference' })).toBeVisible();
});

test('closing nested modal children preserves parent focus protection and releases the final background', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?policy');
  const background = page.getByRole('textbox', { name: 'Background draft' });
  await page.getByRole('button', { name: 'Open parent drawer' }).click();
  const parent = page.getByRole('dialog', { name: 'Parent', exact: true });
  await expect(parent).toBeVisible();
  await expect(background).toBeHidden();
  await parent.getByRole('button', { name: 'Open nested review' }).click();
  const child = page.getByRole('dialog', { name: 'Nested review', exact: true });
  await expect(child).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(child).toBeHidden();
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Open nested review' })).toBeFocused();
  await expect(background).toBeHidden();
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    // Base UI's focus guard returns focus on the next animation frame.
    await expect
      .poll(() => parent.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
  }
  await parent.getByRole('button', { name: 'Parent options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Keep task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Keep task' })).toBeHidden();
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Parent options' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(parent).toBeHidden();
  await expect(background).toBeVisible();
  await background.fill('Usable after final closure');
  await expect(background).toHaveValue('Usable after final closure');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('closing a drawer from its nested review releases both surfaces and leaves the next drawer usable', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/browser.html?policy');
  const opener = page.getByRole('button', { name: 'Open parent drawer' });
  await opener.click();
  const parent = page.getByRole('dialog', { name: 'Parent', exact: true });
  await parent.getByRole('button', { name: 'Open nested review' }).click();
  const child = page.getByRole('dialog', { name: 'Nested review', exact: true });
  await child.getByRole('button', { name: 'Close parent from child' }).click();
  await expect(child).toBeHidden();
  await expect(parent).toBeHidden();
  await expect(opener).toBeFocused();
  const background = page.getByRole('textbox', { name: 'Background draft' });
  await background.fill('Continue after parent closure');
  await page.getByRole('button', { name: 'Open peer drawer' }).click();
  const peer = page.getByRole('dialog', { name: 'Peer', exact: true });
  await expect(background).toBeHidden();
  await peer.getByRole('textbox', { name: 'Peer draft' }).fill('Independent next task');
  await page.keyboard.press('Escape');
  await expect(peer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open peer drawer' })).toBeFocused();
  await expect(background).toHaveValue('Continue after parent closure');
});

for (const firstClosed of ['earlier', 'later']) {
  test(`closing the ${firstClosed} overlapping drawer preserves the remaining modal task`, async ({
    page,
  }) => {
    await page.goto('/ui/kit/tests/browser.html?policy');
    const background = page.getByRole('textbox', { name: 'Background draft' });
    await page.getByRole('button', { name: 'Open parent drawer' }).click();
    const parent = page.getByRole('dialog', { name: 'Parent', exact: true });
    await parent.getByRole('button', { name: 'Open peer task' }).click();
    const peer = page.getByRole('dialog', { name: 'Peer', exact: true });
    await expect(peer).toBeVisible();
    const remaining = firstClosed === 'earlier' ? peer : parent;
    const closed = firstClosed === 'earlier' ? parent : peer;
    await peer
      .getByRole('button', {
        name: firstClosed === 'earlier' ? 'Close earlier drawer' : 'Close peer',
      })
      .click();
    await expect(closed).toBeHidden();
    await expect(remaining).toBeVisible();
    await expect(background).toBeHidden();
    await remaining.getByRole('textbox').fill('Remaining task is editable');
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press('Tab');
      await expect
        .poll(() => remaining.evaluate((node) => node.contains(document.activeElement)))
        .toBe(true);
    }
    await page.mouse.move(5, 5);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(remaining).toBeHidden();
    await expect(background).toBeVisible();
    await background.fill('Background usable after final closure');
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });
}

test('paired sample Escape closes only the focused sample and keeps the other editable', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('Settings');
  const family = page.locator('[data-kit-comparison="settings"]');
  const desktop = family.locator('[data-kit-preview="desktop"]');
  const mobile = family.locator('[data-kit-preview="mobile"]');
  for (const sample of [desktop, mobile])
    await sample.getByRole('button', { name: 'Open settings' }).click();
  await desktop
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('textbox', { name: 'Model', exact: true })
    .fill('desktop remains');
  await mobile
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('textbox', { name: 'Model', exact: true })
    .fill('mobile remains');
  await page.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
  await expect(desktop.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await desktop
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('textbox', { name: 'Model', exact: true })
    .fill('still editable');
  await page.keyboard.press('Escape');
  await expect(desktop.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
  await expect(desktop.getByRole('button', { name: 'Open settings' })).toBeFocused();
});

test('unmounting open settings samples leaves replacement surfaces and reopened drawers usable', async ({
  page,
}) => {
  await page.goto('/ui/kit/');
  const filter = page.getByRole('searchbox', { name: 'Find a component' });
  const settings = page.locator('[data-kit-comparison="settings"]');
  for (let cycle = 0; cycle < 2; cycle++) {
    await filter.fill('Settings');
    for (const device of ['desktop', 'mobile']) {
      const sample = settings.locator(`[data-kit-preview="${device}"]`);
      await sample.getByRole('button', { name: 'Open settings' }).click();
      await sample
        .getByRole('dialog', { name: 'Settings', exact: true })
        .getByRole('textbox', { name: 'Model', exact: true })
        .fill(`Task before unmount ${cycle}`);
    }
    await filter.fill('Search & commands');
    await expect(settings).toHaveCount(0);
    const replacement = page.locator('[data-kit-comparison="search"] [data-kit-preview="mobile"]');
    const opener = replacement.getByRole('button', { name: 'Search your vault', exact: true });
    await opener.click();
    const search = replacement.getByRole('dialog');
    await search.getByRole('combobox').fill('Coffee');
    await expect(search.getByRole('option', { name: 'Coffee with Anna' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();
    await expect(opener).toBeFocused();
  }
  await filter.fill('Settings');
  const mobile = settings.locator('[data-kit-preview="mobile"]');
  const opener = mobile.getByRole('button', { name: 'Open settings' });
  await opener.click();
  await mobile
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('textbox', { name: 'Model', exact: true })
    .fill('Task after unmount');
  await page.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
  await expect(opener).toBeFocused();
  await filter.fill('Buttons & selection');
  await expect(page.locator('[data-kit-comparison="buttons"]')).toBeVisible();
});

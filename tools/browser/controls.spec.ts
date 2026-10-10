import { expect, test } from '@playwright/test';

test('commands filter inferred labels with caller refs and newly added results', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/controls.html');
  const query = page.getByRole('combobox', { name: 'Find a result' });
  const results = page.getByRole('listbox', { name: 'Live results' });
  await query.fill('Coffee');
  await expect(results.getByRole('option', { name: 'Coffee with Anna' })).toBeVisible();
  await page.getByRole('button', { name: 'Add coffee result' }).click();
  await expect(results.getByRole('option', { name: 'Coffee with Jim' })).toBeVisible();
  await query.focus();
  await query.press('ArrowDown');
  await query.press('Enter');
  await expect(page.getByText('Chosen result: Coffee with Jim', { exact: true })).toBeVisible();
  await query.fill('no matching result');
  await expect(results.getByRole('option')).toHaveCount(0);
  await expect(results.getByRole('status')).toHaveText('No matching results.');
});

test('a controlled command input keeps its accepted query and results when an edit is rejected', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/controls.html');
  const query = page.getByRole('combobox', { name: 'Fixed result query' });
  await query.fill('Rejected query');
  await expect(query).toHaveValue('Coffee');
  await expect(page.getByRole('listbox', { name: 'Fixed results' }).getByRole('option')).toHaveText(
    'Coffee with Anna',
  );
});

test('checkbox labels toggle controlled mixed state and submit the checked value', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/controls.html');
  const remember = page.getByRole('checkbox', { name: 'Remember me', exact: true });
  await expect(remember).toHaveAttribute('aria-checked', 'mixed');
  await page.getByText('Remember me', { exact: true }).click();
  await expect(remember).toBeChecked();
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.getByRole('status', { name: 'Submitted preferences' })).toHaveText(
    'Remember: yes',
  );
  await remember.focus();
  await page.keyboard.press('Space');
  await expect(remember).not.toBeChecked();
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.getByRole('status', { name: 'Submitted preferences' })).toHaveText(
    'Remember: absent',
  );
});

test('single and multiple toggle groups preserve their callback values and keyboard navigation', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/controls.html');
  const single = page.getByRole('group', { name: 'Time range' });
  const day = single.getByRole('button', { name: 'Day', exact: true });
  const week = single.getByRole('button', { name: 'Week', exact: true });
  const month = single.getByRole('button', { name: 'Month', exact: true });
  await expect(day).toHaveCSS('border-left-width', '1px');
  await expect(day).toHaveCSS('border-top-width', '1px');
  await expect(week).toHaveCSS('border-left-width', '0px');
  await expect(single).toHaveCSS('column-gap', 'normal');
  await expect(month).toBeDisabled();
  await expect(month).toHaveCSS('opacity', '0.5');
  expect(
    Math.abs(
      (await day.boundingBox())!.x +
        (await day.boundingBox())!.width -
        (await month.boundingBox())!.x,
    ),
  ).toBeLessThan(1);
  await single.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(single.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Single value: week', { exact: true })).toBeVisible();
  await single.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByText('Single value: empty', { exact: true })).toBeVisible();
  await single.getByRole('button', { name: 'Day', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(single.getByRole('button', { name: 'Week', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByText('Single value: week', { exact: true })).toBeVisible();
  const multiple = page.getByRole('group', { name: 'Formatting' });
  await multiple.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(page.getByText('Multiple values: bold,italic', { exact: true })).toBeVisible();
  await multiple.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(page.getByText('Multiple values: italic', { exact: true })).toBeVisible();
  const defaults = page.getByRole('group', { name: 'Default range' });
  await expect(defaults.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await defaults.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(defaults.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(defaults.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const filters = page.getByRole('group', { name: 'Default filters' });
  await filters.getByRole('button', { name: 'Events', exact: true }).click();
  for (const filter of ['Notes', 'Events']) {
    await expect(filters.getByRole('button', { name: filter, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
});

test('tabs retain automatic and manual keyboard activation and controlled selection callbacks', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/controls.html');
  const automatic = page.getByRole('tablist', { name: 'Automatic tabs' });
  await automatic.getByRole('tab', { name: 'Notes', exact: true }).focus();
  await expect(automatic).toHaveCSS('flex-direction', 'row');
  await expect(automatic).toHaveCSS('border-radius', '10px');
  await expect(automatic.getByRole('tab', { name: 'Archived', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(automatic.getByRole('tab', { name: 'Archived', exact: true })).toBeFocused();
  await expect(automatic.getByRole('tab', { name: 'Notes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowRight');
  await expect(automatic.getByRole('tab', { name: 'Activity', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Active tab: activity', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Activity', exact: true })).toHaveText(
    'Recent activity',
  );
  const manual = page.getByRole('tablist', { name: 'Manual tabs' });
  await manual.getByRole('tab', { name: 'Summary', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(manual.getByRole('tab', { name: 'Details', exact: true })).toBeFocused();
  await expect(manual.getByRole('tab', { name: 'Summary', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tabpanel', { name: 'Details', exact: true })).toHaveText(
    'Detailed view',
  );
});

test('rounded horizontal tabs preserve explicitly mounted drafts and release default inactive drafts', async ({
  page,
}) => {
  await page.goto('/ui/kit/tests/controls.html');
  const tabs = page.getByRole('tablist', { name: 'Draft lifetime tabs', exact: true });
  const retained = page.getByRole('textbox', { name: 'Preserved tab draft', exact: true });
  await retained.fill('Keep my draft');
  for (const width of [390, 1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(retained).toBeFocused();
    await expect(tabs).toHaveCSS('flex-direction', 'row');
    await expect(tabs).toHaveCSS('border-radius', '10px');
    await expect(retained).toHaveValue('Keep my draft');
  }
  await tabs.getByRole('tab', { name: 'Temporary draft', exact: true }).click();
  await expect(retained).toBeHidden();
  const temporary = page.getByRole('textbox', { name: 'Temporary tab draft', exact: true });
  await temporary.fill('Discard this draft');
  await tabs.getByRole('tab', { name: 'Preserved draft', exact: true }).click();
  await expect(retained).toHaveValue('Keep my draft');
  await expect(temporary).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Temporary draft', exact: true }).click();
  await expect(temporary).toHaveValue('Initial temporary draft');
});

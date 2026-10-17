import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Biome cannot resolve Playwright's type re-export in CI.
import type { Page } from '@playwright/test';
import type { Journal } from '@/vault/eav/index.ts';

const journal = (page: Page) =>
  page.evaluate(
    () =>
      (
        JSON.parse(
          sessionStorage.getItem('vaulter:preview:eav:dialogue:v1') ?? '{"commits":[]}',
        ) as Journal
      ).commits,
  );

async function selectStatus(page: Page, name: string) {
  await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  if (await filters.isVisible()) {
    await filters.click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
  } else await page.getByRole('main').getByRole('button', { name, exact: true }).click();
}

test('retained question links open the list and returning to Questions keeps the inline draft', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/questions/removed-question/');
  await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Which tools should stay?', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Question details|All questions/ })).toHaveCount(0);
  await selectStatus(page, 'All');
  const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
  await answer.fill('Keep the tools within reach.');
  await page.evaluate(() => {
    location.hash = '#/questions/';
  });
  await expect(page).toHaveURL(/#\/questions\/$/);
  await expect(answer).toHaveValue('Keep the tools within reach.');
});

test('Questions keeps its compact multiline draft through responsive changes and submits with Enter', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.goto('/preview/#/questions/');
  const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
  await expect(answer).toBeEnabled();
  const initial = await journal(page);
  await answer.fill('Use a mobile tool cart.');
  await answer.press('End');
  await answer.press('Shift+Enter');
  await expect(answer).toHaveValue('Use a mobile tool cart.\n');
  const entry = page.getByRole('group', { name: 'Your answer text box', exact: true });
  const save = entry.getByRole('button', { name: 'Save answer', exact: true });
  await expect(save).toBeEnabled();
  await answer.evaluate((field) => field.setAttribute('data-original-field', ''));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(answer).toBeFocused();
    await expect(answer).toHaveAttribute('data-original-field', '');
    await expect(answer).toHaveValue('Use a mobile tool cart.\n');
    const surface = (await entry.locator('[data-slot="input-group"]').boundingBox())!;
    const field = (await answer.boundingBox())!;
    const action = (await save.boundingBox())!;
    expect(action.width).toBeGreaterThanOrEqual(44);
    expect(action.height).toBeGreaterThanOrEqual(44);
    expect(action.x).toBeGreaterThanOrEqual(surface.x + 3);
    expect(action.x + action.width).toBeLessThanOrEqual(surface.x + surface.width - 3);
    expect(action.y + action.height).toBeLessThanOrEqual(surface.y + surface.height - 3);
    expect(Math.abs(action.y - field.y)).toBeLessThanOrEqual(1);
    expect(field.height).toBe(44);
  }
  expect(await journal(page)).toEqual(initial);
  await answer.press('Enter');
  await expect(page.getByText('No open questions.', { exact: true })).toBeVisible();
  await selectStatus(page, 'Answered');
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(
    'Use a mobile tool cart.',
  );
});

test('Questions dictates into the compact draft and saves only when explicitly requested', {
  tag: ['@phone', '@touch'],
}, async ({ page }) => {
  await page.clock.install();
  await page.goto('/preview/#/questions/');
  await expect(page.getByText('Loading conversation…', { exact: true })).toBeHidden();
  const entry = page.getByRole('group', { name: 'Your answer text box', exact: true });
  const answer = entry.getByRole('textbox', { name: 'Your answer', exact: true });
  await answer.fill('Keep the workbench clear.');
  await answer.blur();
  const initial = await journal(page);
  await entry.getByRole('button', { name: 'Start voice interaction', exact: true }).click();
  await expect(answer).toHaveAttribute('readonly');
  // Deliver every scripted word through the actual interval without waiting for demo pacing.
  await page.clock.runFor(5040);
  const dictated =
    'Keep the workbench clear. Leave space for a walk before work, and keep an afternoon free for the garden studio.';
  await expect(answer).toHaveValue(dictated, { timeout: 15_000 });
  await entry.getByRole('button', { name: 'Finish recording', exact: true }).click();
  await expect(answer).not.toHaveAttribute('readonly');
  expect(await journal(page)).toEqual(initial);
  await answer.focus();
  await answer.press('End');
  await answer.press('Shift+Enter');
  await expect(answer).toHaveValue(`${dictated}\n`);
  expect(await journal(page)).toEqual(initial);
  await entry.getByRole('button', { name: 'Save answer', exact: true }).click();
  await selectStatus(page, 'Answered');
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(dictated);
});

async function askQuestion(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill(`ask me: ${text}`);
  await input.press('Enter');
  await expect(page.getByText('Saved question:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const publication = (await journal(page)).find((request) =>
    request.facts.some(
      (fact) => fact.added && fact.attribute === 'questions.question/text' && fact.value === text,
    ),
  )!;
  const identity = publication.facts.find(
    (fact) => fact.added && fact.attribute === 'questions.question/text' && fact.value === text,
  )!.entity;
  const facts = publication.facts.filter((fact) => fact.entity === identity && fact.added);
  const question = {
    key: String(facts.find((fact) => fact.attribute === 'questions.question/key')!.value),
    data: {
      suggestions: JSON.parse(
        (
          facts.find((fact) => fact.attribute === 'questions.question/suggestions')!.value as {
            json: string;
          }
        ).json,
      ),
    },
  };
  const outcomes = await page.evaluate(() => {
    const journal = JSON.parse(sessionStorage.getItem('vaulter:preview:eav:dialogue:v1')!);
    return journal.commits.flatMap(
      (commit: { facts: { added: boolean; attribute: string; value: { json: string } }[] }) =>
        commit.facts
          .filter((fact) => fact.added && fact.attribute === 'agent.toolExecution/output')
          .map((fact) => JSON.parse(fact.value.json)),
    );
  });
  expect(outcomes).toContainEqual({
    question: question.key,
    transaction: publication.id,
    accepted: true,
  });
  const receipt = page.getByRole('link', { name: 'Open questions', exact: true });
  await expect(receipt).toHaveAttribute('href', '#/questions/');
  return { question, publication, receipt };
}

test('agent questions can be answered in Questions and remain on their Wiki page after reload', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/');
  const { question, receipt } = await askQuestion(page, 'Where should the bench go?');
  await receipt.click();
  const record = page
    .getByRole('region', { name: /^(Open question|Answered)$/ })
    .filter({ hasText: 'Where should the bench go?' });
  await expect(record).toBeVisible();
  const proposals = question.data?.suggestions as { title: string; text: string; reason: string }[];
  expect(proposals).toHaveLength(2);
  await expect(record.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue('');
  const beforeChoice = await journal(page);
  await record.getByRole('button', { name: /^Prioritise morning work/ }).click();
  await expect(record.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue(
    proposals[0].text,
  );
  expect(await journal(page)).toEqual(beforeChoice);
  await record
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('Use the garden wall.');
  await record.getByRole('button', { name: 'Save answer', exact: true }).click();
  await selectStatus(page, 'Answered');
  await expect(record).toHaveAttribute('aria-label', 'Answered');
  await expect(record).toContainText('Use the garden wall.');
  const answered = (await journal(page)).find((request) =>
    request.facts.some(
      (fact) =>
        fact.attribute === 'questions.answer/text' &&
        fact.added &&
        fact.value === 'Use the garden wall.',
    ),
  )!;
  expect(
    answered.facts.some(
      (fact) => fact.attribute === 'questions.answer/questionVersion' && fact.added,
    ),
  ).toBe(true);
  const accepted = await journal(page);
  await page.reload();
  await selectStatus(page, 'Answered');
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(
    'Use the garden wall.',
  );
  expect(await journal(page)).toEqual(accepted);
  await page.evaluate(() => {
    location.hash = '#/wiki/preview:page:0/';
  });
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Answered', exact: true })
      .filter({ hasText: 'Where should the bench go?' }),
  ).toContainText('Use the garden wall.');
});

test('suggestion lists preserve edited drafts, inline context and shared card typography in Wiki', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/questions/');
  const record = page.getByRole('region', { name: 'Open question', exact: true });
  await expect(record.getByRole('textbox', { name: 'Your answer', exact: true })).toBeEnabled();
  await expect(page.getByText('Loading conversation…', { exact: true })).toBeHidden();
  const initial = await journal(page);
  const answer = record.getByRole('textbox', { name: 'Your answer', exact: true });
  const choose = (title: string) => record.getByRole('button', { name: new RegExp(`^${title}`) });
  await expect(answer).toHaveValue('');
  await answer.focus();
  await expect(record.getByRole('button', { name: 'Save answer', exact: true })).toBeDisabled();
  await choose('Keep hand tools close').click();
  await expect(answer).toBeFocused();
  await answer.fill('Keep hand tools within reach and leave space to work.');
  await choose('Store everything between sessions').click();
  await expect(answer).toHaveValue(
    'Store every tool after each session, with the chisels and hand plane together in an easy-to-reach drawer.',
  );
  await answer.fill('Use a mobile tool cart.');
  await choose('Keep hand tools close').click();
  await expect(answer).toHaveValue('Keep hand tools within reach and leave space to work.');
  await choose('Store everything between sessions').click();
  await expect(answer).toHaveValue('Use a mobile tool cart.');
  expect(await journal(page)).toEqual(initial);
  await expect(record).toContainText('I use chisels and a hand plane most mornings.');
  await expect(record.getByRole('link', { name: /Garden studio/ })).toBeVisible();
  await expect(record.getByRole('button', { name: 'Source & context', exact: true })).toHaveCount(
    0,
  );
  await expect(choose('Write my own')).toHaveCount(0);
  await expect(answer).toHaveValue('Use a mobile tool cart.');
  const typography = () =>
    record.evaluate((card) => {
      const style = getComputedStyle(card.querySelector('h2')!);
      return {
        font: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        line: style.lineHeight,
      };
    });
  const collectionStyle = await typography();
  await page.evaluate(() => {
    location.hash = '#/wiki/preview:page:0/';
  });
  await expect(page.getByRole('heading', { name: 'Garden studio', exact: true })).toBeVisible();
  await expect(answer).toBeVisible();
  expect(await typography()).toEqual(collectionStyle);
  await expect(record).toContainText('I use chisels and a hand plane most mornings.');
  await expect(record.getByRole('button', { name: 'Source & context', exact: true })).toHaveCount(
    0,
  );
  await expect(choose('Write my own')).toHaveCount(0);
  await answer.fill('A direct answer without choosing a suggestion.');
  await expect(answer).toHaveValue('A direct answer without choosing a suggestion.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(choose('Keep hand tools close')).toBeVisible();
  await expect(answer).toHaveValue('');
  expect(await journal(page)).toEqual(initial);
});

test('Wiki answers update Questions filters and search without creating a second question', {
  tag: '@phone',
}, async ({ page }) => {
  const compact = test.info().project.name === 'phone';
  await page.goto('/preview/#/wiki/preview:page:0/');
  const record = page
    .getByRole('region', { name: /^(Open question|Answered)$/ })
    .filter({ hasText: 'Which tools should stay?' });
  await expect(record).toBeVisible();
  await record
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('Keep the chisels and hand plane.');
  await record.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(record).toHaveAttribute('aria-label', 'Answered');
  await page.evaluate(() => {
    location.hash = '#/questions/';
  });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  if (compact) {
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Open', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');
  } else
    await expect(main.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  await expect(main.getByText('No open questions.', { exact: true })).toBeVisible();
  await selectStatus(page, 'Answered');
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  if (compact) await page.getByRole('button', { name: 'Find questions', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Find questions', exact: true });
  await search.fill('hand plane');
  await expect(main.getByText('Which tools should stay?', { exact: true })).toBeVisible();
  await search.fill('Garden studio');
  await expect(main.getByText('Which tools should stay?', { exact: true })).toBeVisible();
  await search.fill('unrelated subject');
  await expect(main.getByText('No questions found.', { exact: true })).toBeVisible();
  await search.fill('');
  await selectStatus(page, 'Abandoned');
  await expect(main.getByText('No questions found.', { exact: true })).toBeVisible();
  await selectStatus(page, 'All');
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  const before = await journal(page);
  await page.reload();
  await expect(main.getByText('No open questions.', { exact: true })).toBeVisible();
  await selectStatus(page, 'Answered');
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  expect(await journal(page)).toEqual(before);
  const questions = before
    .flatMap(({ facts }) => facts)
    .filter((fact) => fact.added && fact.attribute === 'questions.question/key');
  expect(questions.map(({ value }) => value)).toEqual(['preview:question']);
});

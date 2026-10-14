import { expect, test } from '@playwright/test';
// biome-ignore lint/correctness/noUnresolvedImports: Biome cannot resolve Playwright's type re-export in CI.
import type { Page } from '@playwright/test';
import type { NodeCommit } from '../../app/vault/nodes/store.ts';

const journal = (page: Page) =>
  page.evaluate(
    () => JSON.parse(sessionStorage.getItem('vaulter:preview:accepted:v1') ?? '[]') as NodeCommit[],
  );

async function askQuestion(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill(`ask me: ${text}`);
  await input.press('Enter');
  await expect(page.getByText('Saved question:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  const publication = (await journal(page)).find((request) =>
    request.changes.some((change) => change.data?.kind === 'question' && change.data.text === text),
  )!;
  expect(publication.kind).toEqual({ scope: 'questions', action: 'ask' });
  expect(publication.recordedBy).toBe('vaulter:agent');
  const question = publication.changes.find((change) => change.data?.kind === 'question')!;
  expect(question.placement?.parent).toBe('preview:page:0');
  const execution = (await journal(page))
    .flatMap(({ changes }) => changes)
    .find(
      (change) =>
        change.data?.kind === 'toolExecution' &&
        change.data.name === 'askQuestion' &&
        change.data.status === 'complete',
    )!;
  expect(execution.data?.output).toEqual({
    question: question.node,
    transaction: publication.id,
    accepted: true,
  });
  const receipt = page.getByRole('link', { name: 'Open question', exact: true });
  await expect(receipt).toHaveAttribute('href', `#/questions/${question.node}/`);
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
  await record.getByRole('button', { name: /^Write my own answer/ }).click();
  await record
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('Use the garden wall.');
  await record.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(record).toHaveAttribute('aria-label', 'Answered');
  await expect(record).toContainText('Use the garden wall.');
  const answered = (await journal(page)).find(
    (request) => request.kind.scope === 'questions' && request.kind.action === 'answer',
  )!;
  expect(answered.recordedBy).toBe('vaulter:owner');
  const answer = answered.changes.find((change) => change.data?.kind === 'answer')!;
  const relationship = answered.changes.find((change) => change.data?.predicate === 'answered-by')!;
  expect(relationship.connection?.source.node).toBe(question.node);
  expect(relationship.connection?.target).toEqual({ node: answer.node, transaction: answered.id });
  const accepted = await journal(page);
  await page.reload();
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

test('Balanced drafts preserve each choice, source context and shared card typography in Wiki', {
  tag: '@phone',
}, async ({ page }) => {
  await page.goto('/preview/#/questions/preview:question/');
  const record = page.getByRole('region', { name: 'Open question', exact: true });
  await expect(record.getByRole('textbox', { name: 'Your answer', exact: true })).toBeEnabled();
  await expect(page.getByText('Loading conversation…', { exact: true })).toBeHidden();
  const initial = await journal(page);
  const answer = record.getByRole('textbox', { name: 'Your answer', exact: true });
  const choose = (title: string) => record.getByRole('button', { name: new RegExp(`^${title}`) });
  await expect(answer).toHaveValue('');
  await expect(record.getByRole('button', { name: 'Save answer', exact: true })).toBeDisabled();
  await choose('Keep hand tools close').click();
  await expect(answer).toBeFocused();
  await answer.fill('Keep hand tools within reach and leave space to work.');
  await choose('Store everything between sessions').click();
  await expect(answer).toHaveValue(
    'Store every tool after each session, with the chisels and hand plane together in an easy-to-reach drawer.',
  );
  await choose('Write my own answer').click();
  await answer.fill('Use a mobile tool cart.');
  await choose('Keep hand tools close').click();
  await expect(answer).toHaveValue('Keep hand tools within reach and leave space to work.');
  await choose('Write my own answer').click();
  await expect(answer).toHaveValue('Use a mobile tool cart.');
  expect(await journal(page)).toEqual(initial);
  const source = record.getByRole('button', { name: 'Source & context', exact: true });
  await source.click();
  const drawer = page.getByRole('dialog', { name: 'Source & context', exact: true });
  await expect(drawer).toContainText('I use chisels and a hand plane most mornings.');
  await expect(drawer).toContainText('Leave the workbench clear at the end of each session.');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(source).toBeFocused();
  await expect(answer).toHaveValue('Use a mobile tool cart.');
  const typography = () =>
    record.evaluate((node) => {
      const style = getComputedStyle(node.querySelector('h2')!);
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
  await expect(choose('Write my own answer')).toBeVisible();
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
  const selectStatus = async (name: string) => {
    if (compact) {
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      await page.getByRole('menuitemradio', { name, exact: true }).click();
    } else await page.getByRole('main').getByRole('button', { name, exact: true }).click();
  };
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
  await selectStatus('Answered');
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
  await selectStatus('Abandoned');
  await expect(main.getByText('No questions found.', { exact: true })).toBeVisible();
  await selectStatus('All');
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  const before = await journal(page);
  await page.reload();
  await expect(main.getByText('No open questions.', { exact: true })).toBeVisible();
  await selectStatus('Answered');
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  expect(await journal(page)).toEqual(before);
  const questions = before
    .flatMap(({ changes }) => changes)
    .filter((change) => change.data?.kind === 'question');
  expect(new Set(questions.map(({ node }) => node))).toEqual(new Set(['preview:question']));
});

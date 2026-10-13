import { expect, test } from '@playwright/test';
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
  await record.getByRole('button', { name: 'Answer', exact: true }).click();
  await record.getByRole('textbox', { name: 'Answer', exact: true }).fill('Use the garden wall.');
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

test('Wiki answers update Questions filters and search without creating a second question', async ({
  page,
}) => {
  await page.goto('/preview/#/wiki/preview:page:0/');
  const record = page
    .getByRole('region', { name: /^(Open question|Answered)$/ })
    .filter({ hasText: 'Which tools should stay?' });
  await expect(record).toBeVisible();
  await record.getByRole('button', { name: 'Answer', exact: true }).click();
  await record
    .getByRole('textbox', { name: 'Answer', exact: true })
    .fill('Keep the chisels and hand plane.');
  await record.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(record).toHaveAttribute('aria-label', 'Answered');
  await page.evaluate(() => {
    location.hash = '#/questions/';
  });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(main.getByText('No open questions.', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: 'Answered', exact: true }).click();
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  const search = main.getByRole('searchbox', { name: 'Find questions', exact: true });
  await search.fill('hand plane');
  await expect(main.getByText('Which tools should stay?', { exact: true })).toBeVisible();
  await search.fill('Garden studio');
  await expect(main.getByText('Which tools should stay?', { exact: true })).toBeVisible();
  await search.fill('unrelated subject');
  await expect(main.getByText('No questions found.', { exact: true })).toBeVisible();
  await search.fill('');
  await main.getByRole('button', { name: 'Abandoned', exact: true }).click();
  await expect(main.getByText('No questions found.', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: 'All', exact: true }).click();
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  const before = await journal(page);
  await page.reload();
  await expect(main.getByText('No open questions.', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: 'Answered', exact: true }).click();
  await expect(main.getByText('Keep the chisels and hand plane.', { exact: true })).toBeVisible();
  expect(await journal(page)).toEqual(before);
  const questions = before
    .flatMap(({ changes }) => changes)
    .filter((change) => change.data?.kind === 'question');
  expect(new Set(questions.map(({ node }) => node))).toEqual(new Set(['preview:question']));
});

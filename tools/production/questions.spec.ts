import { expect, test } from '@playwright/test';
import { navigateToModule } from '../browser/app-navigation.ts';
import { fakeGitHub } from '../../app/vault/storage/github-client/fake-github.ts';
import { create, request } from '../../app/vault/nodes/fixtures.test-support.ts';
import { accept } from '../../app/vault/nodes/history.ts';
import { canonical, digest } from '../../app/vault/nodes/json.ts';
import { parseRecord } from '../../app/vault/nodes/validation.ts';
import { seal } from '../../app/vault/session/sealed.ts';
import { sampleFiles } from '../../app/preview/data.ts';

test('production uses Balanced drafts in Questions and Wiki and persists an explicit answer', async ({
  page,
}) => {
  const transaction = 'questions-fixture';
  const initial = request(transaction, [
    create('user', { kind: 'actor', name: 'Fictional owner' }),
    create('studio', { kind: 'page', title: 'Garden studio' }),
    create('knowledge', { kind: 'paragraph' }, 'studio'),
    create('knowledge-text', { kind: 'run', text: 'Keep the workbench clear.' }, 'knowledge'),
    create('source', {
      kind: 'content',
      title: 'Studio tools notes',
      text: 'I use the hand plane every morning and have limited room for tools.',
    }),
    {
      ...create(
        'tools-question',
        {
          kind: 'question',
          text: 'Which tools should stay?',
          suggestions: [
            {
              title: 'Keep hand tools close',
              text: 'Keep the hand plane within reach and clear the bench after each session.',
              reason: 'The source describes daily use; the Wiki notes ask for a clear bench.',
            },
            {
              title: 'Store tools between sessions',
              text: 'Put every tool away after each session in an easy-to-reach drawer.',
              reason: 'The source describes limited room, and the notes prioritise a clear bench.',
            },
          ],
        },
        'studio',
      ),
      placement: { parent: 'studio', order: 'b' },
    },
    ...[
      ['question-source', 'generated-from', 'source'],
      ['question-knowledge', 'informed-by', 'knowledge-text'],
    ].map(([node, predicate, target]) => ({
      ...create(node, { kind: 'relationship', predicate }, 'tools-question'),
      connection: {
        source: { node: 'tools-question', transaction },
        target: { node: target, transaction },
      },
    })),
  ]);
  const initialRecord = accept(
    [],
    initial,
    await digest(canonical(initial)),
    '2026-10-13T09:00:00Z',
  );
  const fake = await fakeGitHub({
    ...sampleFiles,
    '.vaulter/nodes/v1/transactions/questions-fixture.json': JSON.stringify(initialRecord),
  });
  const password = 'fictional-questions-password';
  const sealed = await seal({ github: 'fictional-token' }, password, undefined, 1000);
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const httpRequest = route.request();
    const response = await fake.fetchFn(
      httpRequest.url().replace('https://api.github.com', 'https://gh.test'),
      {
        method: httpRequest.method(),
        headers: httpRequest.headers(),
        body: httpRequest.postData(),
      },
    );
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers),
    });
  });
  await page.goto('/#/questions/tools-question/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeEnabled();
  await navigateToModule(page, 'Questions');
  await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  const compact = test.info().project.name === 'phone';
  if (compact) {
    await expect(page.locator('[data-edge-rail]').getByRole('button')).toHaveCount(3);
    await page.getByRole('button', { name: 'Find questions', exact: true }).click();
  }
  const search = page.getByRole('searchbox', { name: 'Find questions', exact: true });
  await search.fill('No matching fictional question');
  await expect(page.getByText('No questions found.', { exact: true })).toBeVisible();
  await search.fill('Which tools should stay?');
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeVisible();
  if (compact) {
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'All', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).not.toHaveAttribute(
      'data-filtered',
      'true',
    );
    await search.focus();
    await search.press('Escape');
    await expect(search).toHaveCount(0);
  } else await search.fill('');
  await page
    .getByRole('link', { name: 'Question details: Which tools should stay?', exact: true })
    .click();
  if (compact) await expect(page.locator('[data-edge-rail]').getByRole('button')).toHaveCount(1);
  const card = page.getByRole('region', { name: 'Open question', exact: true });
  const answer = card.getByRole('textbox', { name: 'Your answer', exact: true });
  await expect(answer).toBeEnabled();
  await expect(page.getByText('Loading conversation…', { exact: true })).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByRole('complementary', { name: 'Design preview', exact: true }),
  ).toHaveCount(0);
  const presentation = () =>
    card.evaluate((node) => {
      const heading = getComputedStyle(node.querySelector('h2')!);
      const content = getComputedStyle(node.querySelector('[data-slot="card-content"]')!);
      const choice = node
        .querySelector('[data-selection-appearance="card"]')!
        .getBoundingClientRect();
      const editor = node.querySelector('textarea')!.getBoundingClientRect();
      return {
        heading: {
          font: heading.fontFamily,
          size: heading.fontSize,
          weight: heading.fontWeight,
          line: heading.lineHeight,
        },
        padding: content.paddingInline,
        editorHeight: editor.height,
        horizontal: choice.right <= editor.left + 1 && editor.y < choice.bottom,
        stacked: editor.y >= choice.bottom,
      };
    });
  const collection = await presentation();
  expect(collection.padding).toBe('24px');
  expect(collection.editorHeight).toBeGreaterThanOrEqual(112);
  expect(test.info().project.name === 'phone' ? collection.stacked : collection.horizontal).toBe(
    true,
  );
  await expect(answer).toHaveValue('');
  await expect(card.getByRole('button', { name: 'Save answer', exact: true })).toBeDisabled();
  const writesBeforeChoosing = fake.state.calls.filter((call) => call.startsWith('PATCH ')).length;
  await card.getByRole('button', { name: /^Keep hand tools close/ }).click();
  await expect(answer).toHaveValue(
    'Keep the hand plane within reach and clear the bench after each session.',
  );
  await answer.fill('Keep the hand plane close and put the other tools away.');
  await card.getByRole('button', { name: /^Store tools between sessions/ }).click();
  await card.getByRole('button', { name: /^Keep hand tools close/ }).click();
  await expect(answer).toHaveValue('Keep the hand plane close and put the other tools away.');
  expect(fake.state.calls.filter((call) => call.startsWith('PATCH '))).toHaveLength(
    writesBeforeChoosing,
  );
  await card.getByRole('button', { name: 'Source & context', exact: true }).click();
  const context = page.getByRole('dialog', { name: 'Source & context', exact: true });
  await expect(context).toContainText('I use the hand plane every morning');
  await expect(context).toContainText('Keep the workbench clear.');
  await page.keyboard.press('Escape');
  await expect(context).toBeHidden();
  await page.evaluate(() => {
    location.hash = '#/wiki/studio/';
  });
  await expect(answer).toBeEnabled();
  const wiki = await presentation();
  expect(wiki.heading).toEqual(collection.heading);
  expect(wiki.padding).toBe(collection.padding);
  expect(wiki.editorHeight).toBeGreaterThanOrEqual(112);
  await card.getByRole('button', { name: /^Write my own answer/ }).click();
  await answer.fill('Use a mobile tool cart and leave the bench clear.');
  await card.getByRole('button', { name: 'Save answer', exact: true }).click();
  const answered = page.getByRole('region', { name: 'Answered', exact: true });
  await expect(answered).toContainText('Use a mobile tool cart and leave the bench clear.');
  const saved = Object.entries(fake.filesAt())
    .filter(([path]) => path.startsWith('.vaulter/nodes/v1/transactions/'))
    .map(([, text]) => parseRecord(JSON.parse(text)))
    .find((record) => record.transaction.kind.scope === 'questions');
  expect(saved?.transaction).toMatchObject({
    kind: { scope: 'questions', action: 'answer' },
    recordedBy: 'vaulter:owner',
  });
  const recordedAnswer = saved?.versions.find((version) => version.data?.kind === 'answer');
  expect(recordedAnswer?.data?.text).toBe('Use a mobile tool cart and leave the bench clear.');
  expect(
    saved?.versions.find((version) => version.data?.predicate === 'answered-by')?.connection,
  ).toMatchObject({
    source: { node: 'tools-question' },
    target: { node: recordedAnswer?.key.node, transaction: saved?.transaction.id },
  });
  await page.reload();
  await expect(answered).toContainText('Use a mobile tool cart and leave the bench clear.');
  await page.evaluate(() => {
    location.hash = '#/questions/';
  });
  if (compact) {
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Answered', exact: true }).click();
  } else
    await page.getByRole('main').getByRole('button', { name: 'Answered', exact: true }).click();
  await expect(answered).toContainText('Use a mobile tool cart and leave the bench clear.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

import { expect, test } from '@playwright/test';
import { fakeGitHub } from '@/vault/storage/github-client/fake-github.ts';
import { createPersistentStorage, openDatabase, type Journal } from '@/vault/eav/index.ts';
import { applicationSchema } from '@/application/composition.ts';
import { seedEavWiki } from '@/preview/wiki-records.ts';
import { seedEavQuestions } from '@/preview/question-records.ts';
import { seal } from '@/vault/session/sealed.ts';

test.use({
  permissions: ['microphone'],
  launchOptions: {
    ...(process.env.VAULTER_BROWSER ? { executablePath: process.env.VAULTER_BROWSER } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('production dictates into a Question draft and persists only its explicit answer', async ({
  page,
}) => {
  const files: Record<string, string> = {};
  let journal: Journal = { schemas: [], commits: [] };
  const storage = createPersistentStorage({
    scope: JSON.stringify([
      'https://api.github.com',
      'JimLundin',
      'vault',
      'main',
      '.vaulter/eav/transactions/',
    ]),
    load: () => Promise.resolve(journal),
    append: (request) => {
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
      files[`.vaulter/eav/transactions/${encodeURIComponent(request.commit.id)}.json`] =
        JSON.stringify(request);
      return Promise.resolve();
    },
  });
  await using db = await openDatabase({ schema: applicationSchema, storage });
  await seedEavWiki(db);
  await seedEavQuestions(db);
  const fake = await fakeGitHub(files);
  const password = 'fictional-question-dictation-password';
  const sealed = await seal(
    { github: 'fictional-token', openai: 'fictional-openai-key' },
    password,
    undefined,
    1000,
  );
  await page.addInitScript(() => {
    let chunks = 0;
    const NativeRecorder = MediaRecorder;
    class ObservedRecorder extends NativeRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super(stream, options);
        this.addEventListener('dataavailable', ({ data }) => {
          if (data.size) chunks++;
        });
      }
    }
    Reflect.set(globalThis, 'MediaRecorder', ObservedRecorder);
    Reflect.set(globalThis, 'questionRecordingChunks', () => chunks);
  });
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const incoming = route.request();
    const response = await fake.fetchFn(
      incoming.url().replace('https://api.github.com', 'https://gh.test'),
      { method: incoming.method(), headers: incoming.headers(), body: incoming.postData() },
    );
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers),
    });
  });
  let uploads = 0;
  let modelRequests = 0;
  await page.route('https://api.openai.com/v1/**', async (route) => {
    const incoming = route.request();
    expect(incoming.headers().authorization).toBe('Bearer fictional-openai-key');
    if (incoming.url().endsWith('/realtime/client_secrets')) {
      await route.fulfill({
        status: 404,
        json: { error: { message: 'Fictional unavailable Realtime route' } },
      });
    } else if (incoming.url().endsWith('/audio/transcriptions')) {
      uploads++;
      expect(incoming.headers()['content-type']).toContain('multipart/form-data');
      await route.fulfill({ json: { text: 'Beside the garden wall.' } });
    } else {
      modelRequests++;
      await route.fulfill({
        status: 500,
        json: { error: { message: 'Answering must not send a Chat message' } },
      });
    }
  });
  await page.goto('/#/questions/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  const entry = page.getByRole('group', { name: 'Your answer text box', exact: true });
  const answer = entry.getByRole('textbox', { name: 'Your answer', exact: true });
  await expect(answer).toBeEnabled();
  await answer.fill('Leave room for shelves.');
  await answer.blur();
  const writes = () => fake.state.calls.filter((call) => call.startsWith('PATCH ')).length;
  await expect(page.getByText('Loading conversation…', { exact: true })).toBeHidden();
  const before = writes();
  await entry.getByRole('button', { name: 'Start voice interaction', exact: true }).click();
  await expect(entry.getByRole('button', { name: 'Finish recording', exact: true })).toBeVisible();
  await expect(answer).toHaveAttribute('readonly');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, 'questionRecordingChunks')()))
    .toBeGreaterThan(0);
  await entry.getByRole('button', { name: 'Finish recording', exact: true }).click();
  const text = 'Leave room for shelves. Beside the garden wall.';
  await expect(answer).toHaveValue(text);
  await expect(answer).not.toHaveAttribute('readonly');
  expect(uploads).toBe(1);
  expect(writes()).toBe(before);
  expect(modelRequests).toBe(0);
  await answer.focus();
  await answer.press('End');
  await answer.press('Shift+Enter');
  await expect(answer).toHaveValue(`${text}\n`);
  expect(writes()).toBe(before);
  await answer.press('Enter');
  const showAnswered = async () => {
    if (test.info().project.name === 'phone') {
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      await page.getByRole('menuitemradio', { name: 'Answered', exact: true }).click();
    } else
      await page.getByRole('main').getByRole('button', { name: 'Answered', exact: true }).click();
  };
  await showAnswered();
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(text);
  await page.reload();
  await showAnswered();
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(text);
  expect(modelRequests).toBe(0);
});

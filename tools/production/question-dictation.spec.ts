import { expect, test } from '@playwright/test';
import { fakeGitHub } from '../../app/vault/storage/github-client/fake-github.ts';
import { create, request } from '../../app/vault/nodes/fixtures.test-support.ts';
import { accept } from '../../app/vault/nodes/history.ts';
import { canonical, digest } from '../../app/vault/nodes/json.ts';
import { seal } from '../../app/vault/session/sealed.ts';
import { sampleFiles } from '../../app/preview/data.ts';

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
  const initial = request('spoken-question-fixture', [
    create('user', { kind: 'actor', name: 'Fictional owner' }),
    create('spoken-question', { kind: 'question', text: 'Where should the workbench go?' }),
  ]);
  const record = accept([], initial, await digest(canonical(initial)), '2026-10-14T09:00:00Z');
  const fake = await fakeGitHub({
    ...sampleFiles,
    '.vaulter/nodes/v1/transactions/spoken-question-fixture.json': JSON.stringify(record),
  });
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
  await page.goto('/#/questions/spoken-question/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  const entry = page.getByRole('group', { name: 'Your answer text box', exact: true });
  const answer = entry.getByRole('textbox', { name: 'Your answer', exact: true });
  await expect(answer).toBeEnabled();
  await answer.fill('Leave room for shelves.');
  await answer.blur();
  const writes = () => fake.state.calls.filter((call) => call.startsWith('PATCH ')).length;
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
  await answer.press('Enter');
  await expect(answer).toHaveValue(`${text}\n`);
  expect(writes()).toBe(before);
  await answer.press('Tab');
  await expect(entry.getByRole('button', { name: 'Save answer', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(text);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Answered', exact: true })).toContainText(text);
  expect(modelRequests).toBe(0);
});
